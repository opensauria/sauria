# Multi-Agent Collaboration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make agents share context on forwards, inject workspace knowledge into LLM routing, persist graph mutations, and harden the owner command parser.

**Architecture:** Five surgical changes across four files. No schema migration needed (`agent_memory.workspace_id` already exists). Total additional tokens per routing decision: ~350-400 (negligible vs base ~2000-4000).

**Tech Stack:** TypeScript, SQLite (better-sqlite3), Vitest, Zod

---

### Task 1: Add `getRecentMessagesForContext()` to AgentMemory

Returns formatted messages with sender labels, used by the orchestrator when enriching forwards.

**Files:**

- Modify: `src/orchestrator/agent-memory.ts`
- Test: `src/orchestrator/__tests__/agent-memory.test.ts`

**Step 1: Write the failing test**

Add to `src/orchestrator/__tests__/agent-memory.test.ts` inside the `AgentMemory` describe block:

```typescript
describe('getRecentMessagesForContext', () => {
  it('returns formatted messages with sender labels', () => {
    const conversationId = memory.getOrCreateConversation('telegram', 'g1', ['node1']);

    memory.recordMessage({
      conversationId,
      sourceNodeId: 'node1',
      senderId: 'user1',
      senderIsOwner: true,
      platform: 'telegram',
      groupId: 'g1',
      content: 'Schedule a meeting with design',
      contentType: 'text',
    });

    memory.recordMessage({
      conversationId,
      sourceNodeId: 'node1',
      senderId: 'bot1',
      senderIsOwner: false,
      platform: 'telegram',
      groupId: 'g1',
      content: 'I will coordinate with the design workspace',
      contentType: 'text',
    });

    const nodeLabels = new Map([['node1', '@SupportBot']]);
    const result = memory.getRecentMessagesForContext(conversationId, 5, nodeLabels);

    expect(result).toHaveLength(2);
    expect(result[0]).toBe('[Owner] Schedule a meeting with design');
    expect(result[1]).toBe('[@SupportBot] I will coordinate with the design workspace');
  });

  it('returns empty array when no messages exist', () => {
    const result = memory.getRecentMessagesForContext('nonexistent', 5, new Map());
    expect(result).toHaveLength(0);
  });

  it('respects limit parameter', () => {
    const conversationId = memory.getOrCreateConversation('telegram', null, ['node1']);
    for (let i = 0; i < 10; i++) {
      memory.recordMessage({
        conversationId,
        sourceNodeId: 'node1',
        senderId: 'user1',
        senderIsOwner: false,
        platform: 'telegram',
        groupId: null,
        content: `Message ${i}`,
        contentType: 'text',
      });
    }

    const result = memory.getRecentMessagesForContext(conversationId, 3, new Map());
    expect(result).toHaveLength(3);
  });

  it('falls back to sourceNodeId when label not in map', () => {
    const conversationId = memory.getOrCreateConversation('telegram', null, ['node1']);
    memory.recordMessage({
      conversationId,
      sourceNodeId: 'node1',
      senderId: 'user1',
      senderIsOwner: false,
      platform: 'telegram',
      groupId: null,
      content: 'Hello',
      contentType: 'text',
    });

    const result = memory.getRecentMessagesForContext(conversationId, 5, new Map());
    expect(result).toEqual(['[node1] Hello']);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/orchestrator/__tests__/agent-memory.test.ts`
Expected: FAIL — `getRecentMessagesForContext is not a function`

**Step 3: Implement `getRecentMessagesForContext`**

Add to `src/orchestrator/agent-memory.ts` in the `AgentMemory` class, after `getConversationHistory`:

```typescript
getRecentMessagesForContext(
  conversationId: string,
  limit: number,
  nodeLabels: ReadonlyMap<string, string>,
): string[] {
  const messages = this.getConversationHistory(conversationId, limit);
  return messages.map((msg) => {
    const sender = msg.senderIsOwner
      ? 'Owner'
      : (nodeLabels.get(msg.sourceNodeId) ?? msg.sourceNodeId);
    return `[${sender}] ${msg.content}`;
  });
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/orchestrator/__tests__/agent-memory.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/orchestrator/agent-memory.ts src/orchestrator/__tests__/agent-memory.test.ts
git commit -m "feat: add getRecentMessagesForContext to AgentMemory"
```

---

### Task 2: Enrich forwards/notifies with conversation context in orchestrator

When `executeAction()` dispatches a `forward` or `notify`, prepend the N most recent messages from the source conversation.

**Files:**

- Modify: `src/orchestrator/orchestrator.ts`
- Test: `src/orchestrator/__tests__/orchestrator.test.ts`

**Step 1: Write the failing test**

Add to `src/orchestrator/__tests__/orchestrator.test.ts`. This test needs a DB and AgentMemory. Add these imports and modify the test file:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { applySchema } from '../../db/schema.js';
import { AgentOrchestrator } from '../orchestrator.js';
import { AgentMemory } from '../agent-memory.js';
import type { CanvasGraph, OwnerIdentity, InboundMessage } from '../types.js';
import { DEFAULT_GROUP_BEHAVIOR, createEmptyGraph } from '../types.js';
import { ChannelRegistry } from '../../channels/registry.js';
```

Add a new describe block:

```typescript
describe('executeAction forward enrichment', () => {
  let db: Database.Database;
  let registry: ChannelRegistry;
  let orchestrator: AgentOrchestrator;

  const graph: CanvasGraph = {
    ...createEmptyGraph(),
    workspaces: [
      {
        id: 'ws1',
        name: 'Support',
        color: '#ff0000',
        purpose: 'Handle support',
        topics: ['support'],
        budget: { dailyLimitUsd: 5, preferCheap: true },
        position: { x: 0, y: 0 },
        size: { width: 400, height: 300 },
        checkpoints: [],
        groups: [],
      },
    ],
    nodes: [
      {
        id: 'n1',
        platform: 'telegram',
        label: '@support_bot',
        photo: null,
        position: { x: 0, y: 0 },
        status: 'connected',
        credentials: 'key',
        meta: {},
        workspaceId: 'ws1',
        role: 'assistant',
        autonomy: 'supervised',
        instructions: '',
        groupBehavior: DEFAULT_GROUP_BEHAVIOR,
      },
      {
        id: 'n2',
        platform: 'slack',
        label: '@design_bot',
        photo: null,
        position: { x: 200, y: 0 },
        status: 'connected',
        credentials: 'key',
        meta: {},
        workspaceId: 'ws1',
        role: 'specialist',
        autonomy: 'supervised',
        instructions: '',
        groupBehavior: DEFAULT_GROUP_BEHAVIOR,
      },
    ],
  };

  beforeEach(() => {
    db = new Database(':memory:');
    applySchema(db);
    registry = new ChannelRegistry();

    const sendTo = vi.fn().mockResolvedValue(undefined);
    registry.sendTo = sendTo;

    const agentMemory = new AgentMemory(db);
    orchestrator = new AgentOrchestrator({
      registry,
      graph,
      ownerIdentity: { telegram: { userId: 123 } },
      agentMemory,
    });
  });

  afterEach(() => {
    db.close();
  });

  it('enriches forward content with recent conversation context', async () => {
    // Record some conversation history for the source node
    const agentMemory = new AgentMemory(db);
    const conversationId = agentMemory.getOrCreateConversation('telegram', null, ['n1']);
    agentMemory.recordMessage({
      conversationId,
      sourceNodeId: 'n1',
      senderId: 'user123',
      senderIsOwner: true,
      platform: 'telegram',
      groupId: null,
      content: 'Schedule a meeting with design',
      contentType: 'text',
    });
    agentMemory.recordMessage({
      conversationId,
      sourceNodeId: 'n1',
      senderId: 'bot1',
      senderIsOwner: false,
      platform: 'telegram',
      groupId: null,
      content: 'I will coordinate with design',
      contentType: 'text',
    });

    // Simulate an inbound message that creates a conversationId
    const source: InboundMessage = {
      sourceNodeId: 'n1',
      platform: 'telegram',
      senderId: 'user123',
      senderIsOwner: true,
      groupId: null,
      content: 'Forward this to design',
      contentType: 'text',
      timestamp: new Date().toISOString(),
    };

    await orchestrator.executeAction(
      { type: 'forward', targetNodeId: 'n2', content: 'Please handle design meeting' },
      source,
    );

    const sendTo = registry.sendTo as ReturnType<typeof vi.fn>;
    expect(sendTo).toHaveBeenCalledOnce();
    const sentContent = sendTo.mock.calls[0][1] as string;

    // The forwarded content should contain conversation context
    expect(sentContent).toContain('[Forwarded from @support_bot]');
    expect(sentContent).toContain('Schedule a meeting with design');
    expect(sentContent).toContain('Please handle design meeting');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/orchestrator/__tests__/orchestrator.test.ts`
Expected: FAIL — forwarded content does not contain enrichment

**Step 3: Implement forward enrichment**

In `src/orchestrator/orchestrator.ts`, modify the `executeAction` method. Add a private method to build context and modify the forward/notify cases:

```typescript
private buildForwardContext(sourceNodeId: string, platform: string, groupId: string | null): string {
  if (!this.agentMemory) return '';

  const sourceNode = this.findNode(sourceNodeId);
  if (!sourceNode) return '';

  const conversationId = this.agentMemory.getOrCreateConversation(
    platform,
    groupId,
    [sourceNodeId],
  );

  const nodeLabels = new Map(
    this.graph.nodes.map((n) => [n.id, n.label]),
  );
  const recentMessages = this.agentMemory.getRecentMessagesForContext(
    conversationId,
    5,
    nodeLabels,
  );

  if (recentMessages.length === 0) return '';

  return [
    `[Forwarded from ${sourceNode.label}]`,
    '[Recent context]:',
    ...recentMessages.map((m) => `- ${m}`),
    '',
    '[Message]:',
  ].join('\n');
}
```

Then update the `forward` and `notify` cases in `executeAction`:

```typescript
case 'forward': {
  const group = this.findGroupForNode(action.targetNodeId);
  const contextPrefix = this.buildForwardContext(
    source.sourceNodeId,
    source.platform,
    source.groupId,
  );
  const enrichedContent = contextPrefix
    ? `${contextPrefix}\n${action.content}`
    : action.content;
  await this.registry.sendTo(action.targetNodeId, enrichedContent, group);
  break;
}
case 'notify': {
  const group = this.findGroupForNode(action.targetNodeId);
  const contextPrefix = this.buildForwardContext(
    source.sourceNodeId,
    source.platform,
    source.groupId,
  );
  const enrichedSummary = contextPrefix
    ? `${contextPrefix}\n${action.summary}`
    : action.summary;
  await this.registry.sendTo(action.targetNodeId, enrichedSummary, group);
  break;
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/orchestrator/__tests__/orchestrator.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/orchestrator/orchestrator.ts src/orchestrator/__tests__/orchestrator.test.ts
git commit -m "feat: enrich forwards/notifies with conversation context"
```

---

### Task 3: Inject workspace facts and peer messages into LLM routing prompt

Two changes to `buildRoutingPrompt()`:

1. Include workspace facts (from `getWorkspaceFacts`)
2. Include peer messages from other nodes in the same workspace

**Files:**

- Modify: `src/orchestrator/llm-router.ts`
- Test: `src/orchestrator/__tests__/llm-router.test.ts`

**Step 1: Write the failing tests**

Add to `src/orchestrator/__tests__/llm-router.test.ts`. First, we need to export `buildRoutingPrompt` for testing. Since it's currently a module-level function (not exported), we'll test it indirectly through `decideRouting` by checking what's passed to the LLM.

Add these tests inside the `LLMRoutingBrain` > `decideRouting` describe:

```typescript
it('includes workspace facts in the routing prompt', async () => {
  // Store workspace facts
  const agentMemory = new AgentMemory(db);
  agentMemory.storeFact(
    'n1',
    'ws1',
    'Design team prefers async standups',
    ['process'],
    'conversation',
  );
  agentMemory.storeFact('n2', 'ws1', 'Budget approved for Q2 hiring', ['finance'], 'conversation');

  const responseJson = JSON.stringify({
    actions: [{ type: 'reply', content: 'Noted' }],
  });
  const router = createMockRouter(responseJson);
  const brain = new LLMRoutingBrain(router, db);
  const context = buildContext({
    message: buildMessage({
      content: 'What do we know about the team preferences and budget?',
    }),
    workspace: baseWorkspace,
  });

  await brain.decideRouting(context);

  // Verify the prompt sent to the LLM contains workspace facts
  const reasonCall = (router.reason as ReturnType<typeof vi.fn>).mock.calls[0];
  const messages = reasonCall[0] as Array<{ role: string; content: string }>;
  const systemPrompt = messages.find((m) => m.role === 'system')?.content ?? '';
  expect(systemPrompt).toContain('Workspace knowledge');
  expect(systemPrompt).toContain('Design team prefers async standups');
  expect(systemPrompt).toContain('Budget approved for Q2 hiring');
});

it('includes peer messages from other workspace nodes in the routing prompt', async () => {
  const agentMemory = new AgentMemory(db);
  const peerNode: AgentNode = {
    ...baseNode,
    id: 'n2',
    label: '@design-bot',
    role: 'specialist',
  };

  // Record a message on a peer node's conversation
  const peerConvId = agentMemory.getOrCreateConversation('telegram', null, ['n2']);
  agentMemory.recordMessage({
    conversationId: peerConvId,
    sourceNodeId: 'n2',
    senderId: 'user2',
    senderIsOwner: false,
    platform: 'telegram',
    groupId: null,
    content: 'Design review completed for landing page',
    contentType: 'text',
  });

  const responseJson = JSON.stringify({
    actions: [{ type: 'reply', content: 'Noted' }],
  });
  const router = createMockRouter(responseJson);
  const brain = new LLMRoutingBrain(router, db);
  const context = buildContext({
    message: buildMessage({
      content: 'What is the status of the design review?',
    }),
    teamNodes: [baseNode, peerNode],
    workspace: baseWorkspace,
  });

  await brain.decideRouting(context);

  const reasonCall = (router.reason as ReturnType<typeof vi.fn>).mock.calls[0];
  const messages = reasonCall[0] as Array<{ role: string; content: string }>;
  const systemPrompt = messages.find((m) => m.role === 'system')?.content ?? '';
  expect(systemPrompt).toContain('Recent peer activity');
  expect(systemPrompt).toContain('Design review completed for landing page');
});
```

Also add the `AgentMemory` import at the top if not already present (it's already imported via `../agent-memory.js`).

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/orchestrator/__tests__/llm-router.test.ts`
Expected: FAIL — system prompt does not contain 'Workspace knowledge' or 'Recent peer activity'

**Step 3: Implement workspace facts and peer messages in buildRoutingPrompt**

In `src/orchestrator/llm-router.ts`, modify `buildRoutingPrompt()`:

After the `conversationContext` block (around line 166), add:

```typescript
// Workspace facts
let workspaceFactsText = '';
if (workspace) {
  const facts = memory.getWorkspaceFacts(workspace.id, 5);
  if (facts.length > 0) {
    workspaceFactsText = ['Workspace knowledge:', ...facts.map((f) => `- ${f}`)].join('\n');
  }
}

// Peer messages from other nodes in the same workspace
let peerMessagesText = '';
if (teamNodes.length > 1) {
  const peerLines: string[] = [];
  for (const peerNode of teamNodes) {
    if (peerNode.id === sourceNode.id) continue;
    const peerConvId = memory.getOrCreateConversation(peerNode.platform, null, [peerNode.id]);
    const peerHistory = memory.getConversationHistory(peerConvId, 2);
    for (const msg of peerHistory) {
      peerLines.push(`[${peerNode.label}] ${msg.content}`);
    }
  }
  if (peerLines.length > 0) {
    peerMessagesText = ['Recent peer activity:', ...peerLines.slice(0, 5)].join('\n');
  }
}
```

Then add these blocks to the system prompt array (before the `ruleActionsText` line):

```typescript
...(workspaceFactsText ? [workspaceFactsText, ''] : []),
...(peerMessagesText ? [peerMessagesText, ''] : []),
```

The full `systemPrompt` array in `buildRoutingPrompt` should look like:

```typescript
const systemPrompt = [
  'You are the routing brain for a team of AI agents.',
  '',
  `Team: ${workspace?.name ?? 'Unknown'}`,
  `Purpose: ${workspace?.purpose ?? 'General'}`,
  `Topics: ${workspace?.topics.join(', ') ?? 'None'}`,
  '',
  'Agents in this team:',
  agentList || '(no agents)',
  '',
  `Incoming message from ${sourceNode.label} (${sourceNode.role}):`,
  `"${message.content}"`,
  '',
  conversationContext
    ? `Recent conversation context:\n${conversationContext}`
    : 'No prior conversation context.',
  '',
  ...(workspaceFactsText ? [workspaceFactsText, ''] : []),
  ...(peerMessagesText ? [peerMessagesText, ''] : []),
  ruleActionsText,
  '',
  `When generating reply content, respond in character as ${sourceNode.meta?.['firstName'] || sourceNode.label.replace(/^@/, '')} (${sourceNode.role ?? 'assistant'}). Never mention being Claude, an AI model, or a language model.`,
  ...(globalInstructions || sourceNode.instructions
    ? [
        'Response style instructions (apply to all reply content):',
        ...(globalInstructions ? [globalInstructions] : []),
        ...(sourceNode.instructions ? [sourceNode.instructions] : []),
        '',
      ]
    : []),
  'Decide what actions to take. Return ONLY valid JSON:',
  '{"actions": [{"type": "reply", "content": "..."}, ...]}',
  '',
  'Valid action types: reply, forward, assign, notify, send_to_all, learn, group_message',
  'For forward/assign/notify: include "targetNodeId"',
  'For assign: include "task" and "priority" (low/normal/high)',
  'For notify: include "summary"',
  'For send_to_all/group_message: include "workspaceId" and "content"',
  'For learn: include "fact" and "topics" (string array)',
].join('\n');
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/orchestrator/__tests__/llm-router.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/orchestrator/llm-router.ts src/orchestrator/__tests__/llm-router.test.ts
git commit -m "feat: inject workspace facts and peer messages into routing prompt"
```

---

### Task 4: Persist graph mutations from owner commands

`handleOwnerCommand()` for `promote`, `reassign`, `fire`, and `pause` mutates the in-memory graph but never writes it back to `canvas.json`. Fix: write after each mutation.

**Files:**

- Modify: `src/orchestrator/orchestrator.ts`
- Test: `src/orchestrator/__tests__/orchestrator.test.ts`

**Step 1: Write the failing test**

Add to `src/orchestrator/__tests__/orchestrator.test.ts`:

```typescript
import { writeFileSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
```

Add a new describe block:

```typescript
describe('handleOwnerCommand graph persistence', () => {
  let tmpDir: string;
  let canvasPath: string;
  let registry: ChannelRegistry;
  let orchestrator: AgentOrchestrator;

  const graphWithTwoNodes: CanvasGraph = {
    ...createEmptyGraph(),
    workspaces: [
      {
        id: 'ws1',
        name: 'Support',
        color: '#ff0000',
        purpose: 'Handle support',
        topics: ['support'],
        budget: { dailyLimitUsd: 5, preferCheap: true },
        position: { x: 0, y: 0 },
        size: { width: 400, height: 300 },
        checkpoints: [],
        groups: [],
      },
      {
        id: 'ws2',
        name: 'Design',
        color: '#00ff00',
        purpose: 'Handle design',
        topics: ['design'],
        budget: { dailyLimitUsd: 5, preferCheap: true },
        position: { x: 500, y: 0 },
        size: { width: 400, height: 300 },
        checkpoints: [],
        groups: [],
      },
    ],
    nodes: [
      {
        id: 'n1',
        platform: 'telegram',
        label: '@support_bot',
        photo: null,
        position: { x: 0, y: 0 },
        status: 'connected',
        credentials: 'key',
        meta: {},
        workspaceId: 'ws1',
        role: 'assistant',
        autonomy: 'supervised',
        instructions: '',
        groupBehavior: DEFAULT_GROUP_BEHAVIOR,
      },
      {
        id: 'n2',
        platform: 'slack',
        label: '@design_bot',
        photo: null,
        position: { x: 200, y: 0 },
        status: 'connected',
        credentials: 'key',
        meta: {},
        workspaceId: 'ws1',
        role: 'specialist',
        autonomy: 'supervised',
        instructions: '',
        groupBehavior: DEFAULT_GROUP_BEHAVIOR,
      },
    ],
  };

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'openwind-test-'));
    canvasPath = join(tmpDir, 'canvas.json');
    writeFileSync(canvasPath, JSON.stringify(graphWithTwoNodes), 'utf-8');

    registry = new ChannelRegistry();
    orchestrator = new AgentOrchestrator({
      registry,
      graph: graphWithTwoNodes,
      ownerIdentity: { telegram: { userId: 123 } },
      canvasPath,
    });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('persists graph to canvas.json after promote', async () => {
    await orchestrator.handleOwnerCommand({
      type: 'promote',
      agentId: 'n1',
      newAutonomy: 'full',
    });

    const saved = JSON.parse(readFileSync(canvasPath, 'utf-8'));
    const node = saved.nodes.find((n: { id: string }) => n.id === 'n1');
    expect(node.autonomy).toBe('full');
  });

  it('persists graph to canvas.json after reassign', async () => {
    await orchestrator.handleOwnerCommand({
      type: 'reassign',
      agentId: 'n1',
      newWorkspaceId: 'ws2',
    });

    const saved = JSON.parse(readFileSync(canvasPath, 'utf-8'));
    const node = saved.nodes.find((n: { id: string }) => n.id === 'n1');
    expect(node.workspaceId).toBe('ws2');
  });

  it('persists graph to canvas.json after fire', async () => {
    await orchestrator.handleOwnerCommand({
      type: 'fire',
      agentId: 'n2',
    });

    const saved = JSON.parse(readFileSync(canvasPath, 'utf-8'));
    expect(saved.nodes).toHaveLength(1);
    expect(saved.nodes[0].id).toBe('n1');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/orchestrator/__tests__/orchestrator.test.ts`
Expected: FAIL — `canvasPath` not accepted or file not written

**Step 3: Implement graph persistence**

In `src/orchestrator/orchestrator.ts`:

1. Add `writeFileSync` import at top:

```typescript
import { writeFileSync } from 'node:fs';
```

2. Add `canvasPath` to `OrchestratorDeps`:

```typescript
interface OrchestratorDeps {
  readonly registry: ChannelRegistry;
  readonly graph: CanvasGraph;
  readonly ownerIdentity: OwnerIdentity;
  readonly brain?: LLMRoutingBrain;
  readonly db?: BetterSqlite3.Database;
  readonly agentMemory?: AgentMemory;
  readonly kpiTracker?: KPITracker;
  readonly checkpointManager?: CheckpointManager;
  readonly canvasPath?: string;
}
```

3. Add field in class and constructor:

```typescript
private readonly canvasPath: string | null;
```

In constructor:

```typescript
this.canvasPath = deps.canvasPath ?? null;
```

4. Add a `persistGraph` method:

```typescript
private persistGraph(): void {
  if (!this.canvasPath) return;
  try {
    writeFileSync(this.canvasPath, JSON.stringify(this.graph, null, 2), 'utf-8');
  } catch (error) {
    const logger = getLogger();
    logger.warn('Failed to persist canvas graph', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
```

5. Call `this.persistGraph()` at the end of the `promote`, `reassign`, `fire`, and `pause` cases in `handleOwnerCommand`.

For `promote` — add after `this.graph = { ...this.graph, nodes: mutableNodes };`:

```typescript
this.persistGraph();
```

Same for `reassign`, `fire`, and `pause`.

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/orchestrator/__tests__/orchestrator.test.ts`
Expected: ALL PASS

**Step 5: Wire up canvasPath in daemon-lifecycle.ts**

In `src/daemon-lifecycle.ts`, pass `canvasPath` when constructing the orchestrator. In `setupOrchestrator` (around line 506):

```typescript
const orchestrator = new AgentOrchestrator({
  registry,
  graph,
  ownerIdentity,
  brain,
  db: deps.db,
  agentMemory,
  kpiTracker,
  checkpointManager,
  canvasPath: paths.canvas,
});
```

Add `paths` import if not already available (it's already imported at line 35).

**Step 6: Run all tests**

Run: `npx vitest run`
Expected: ALL PASS

**Step 7: Commit**

```bash
git add src/orchestrator/orchestrator.ts src/orchestrator/__tests__/orchestrator.test.ts src/daemon-lifecycle.ts
git commit -m "feat: persist canvas graph after owner command mutations"
```

---

### Task 5: Robust owner command file parsing

The owner command watcher in `daemon-lifecycle.ts` clears the file immediately after reading (line 760), then parses each line. If a line fails to parse, the command is lost. Fix: only clear successfully processed lines, rewrite failed lines.

**Files:**

- Modify: `src/daemon-lifecycle.ts`

**Step 1: Identify the code to change**

In `src/daemon-lifecycle.ts`, the `processOwnerCommands` function (lines 753-783):

Current behavior:

1. Read file content
2. Clear file immediately (`writeFileSync(paths.ownerCommands, '', 'utf-8')`)
3. Parse each line — if parsing fails, log warning and `continue` (line lost)

Desired behavior:

1. Read file content
2. Parse each line, collecting failed lines
3. Write back only the failed lines (so they can be retried or investigated)

**Step 2: Implement the fix**

Replace the `processOwnerCommands` function body:

```typescript
const processOwnerCommands = (): void => {
  if (!existsSync(paths.ownerCommands)) return;
  try {
    const content = readFileSync(paths.ownerCommands, 'utf-8').trim();
    if (!content) return;

    const lines = content.split('\n').filter(Boolean);
    const failedLines: string[] = [];

    for (const line of lines) {
      try {
        const parsed: unknown = JSON.parse(line);
        const result = OwnerCommandSchema.safeParse(parsed);
        if (!result.success) {
          logger.warn('Invalid owner command schema', { error: result.error.message });
          failedLines.push(line);
          continue;
        }
        const command: OwnerCommand = result.data;
        audit.logAction('owner:command_received', { type: command.type });
        void orchestrator.handleOwnerCommand(command);
      } catch {
        logger.warn('Invalid owner command JSON', { line });
        failedLines.push(line);
      }
    }

    // Write back only failed lines (or clear if all succeeded)
    writeFileSync(
      paths.ownerCommands,
      failedLines.length > 0 ? failedLines.join('\n') + '\n' : '',
      'utf-8',
    );
  } catch (error) {
    logger.warn('Error reading owner commands', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
```

**Step 3: Run all tests**

Run: `npx vitest run`
Expected: ALL PASS

**Step 4: Commit**

```bash
git add src/daemon-lifecycle.ts
git commit -m "fix: preserve failed owner command lines instead of discarding"
```

---

### Task 6: Run full test suite and rebuild

**Step 1: Run all tests**

Run: `npx vitest run`
Expected: ALL PASS (213+ tests)

**Step 2: Build daemon**

Run: `npm run build`
Expected: Clean build, no errors

**Step 3: Final commit (if any lint/format fixes needed)**

```bash
git add -A
git commit -m "chore: format and lint fixes"
```

---

## Summary of Changes

| File                  | Change                                                    | Tokens added         |
| --------------------- | --------------------------------------------------------- | -------------------- |
| `agent-memory.ts`     | `getRecentMessagesForContext()` method                    | 0 (no LLM cost)      |
| `orchestrator.ts`     | Enrich forward/notify + `persistGraph()` + `canvasPath`   | ~150-200 per forward |
| `llm-router.ts`       | Workspace facts + peer messages in `buildRoutingPrompt()` | ~200 per routing     |
| `daemon-lifecycle.ts` | Robust command parsing + pass `canvasPath`                | 0                    |

**Total additional tokens per routing decision: ~350-400** (negligible vs base ~2000-4000)
