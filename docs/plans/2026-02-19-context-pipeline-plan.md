# Context Pipeline Fix Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix 6 wiring gaps that prevent agent conversation context from reaching the LLM routing prompt, causing agents to restart from zero every message.

**Architecture:** Token-budget-aware context injection. Each context section (history, knowledge graph, agent facts) has a max token budget. A simple `estimateTokens(text)` function (`Math.ceil(text.length / 4)`) gates how much context gets injected. No new deps, no new tables.

**Tech Stack:** TypeScript strict mode, SQLite FTS5 (existing), Vitest, better-sqlite3

---

### Task 1: Add `estimateTokens` utility and `getHistoryWithinBudget` to AgentMemory

**Files:**

- Modify: `src/orchestrator/agent-memory.ts:143-155` (add new method after `getRecentMessagesForContext`)
- Test: `src/orchestrator/__tests__/agent-memory.test.ts`

**Step 1: Write the failing tests**

Add to `src/orchestrator/__tests__/agent-memory.test.ts`, inside the top-level `describe('AgentMemory')` block, after the `getRecentMessagesForContext` describe:

```typescript
describe('getHistoryWithinBudget', () => {
  it('returns messages up to the token budget', () => {
    const conversationId = memory.getOrCreateConversation('telegram', null, ['node1']);
    for (let i = 0; i < 10; i++) {
      memory.recordMessage({
        conversationId,
        sourceNodeId: 'node1',
        senderId: 'user1',
        senderIsOwner: false,
        platform: 'telegram',
        groupId: null,
        content: `Message number ${i} with some content`,
        contentType: 'text',
      });
    }

    // Each message is roughly ~10 tokens. Budget of 30 tokens should return ~3 messages.
    const result = memory.getHistoryWithinBudget(conversationId, 30);
    expect(result.length).toBeGreaterThan(0);
    expect(result.length).toBeLessThan(10);
  });

  it('returns messages in chronological order', () => {
    const conversationId = memory.getOrCreateConversation('telegram', null, ['node1']);
    memory.recordMessage({
      conversationId,
      sourceNodeId: 'node1',
      senderId: 'user1',
      senderIsOwner: false,
      platform: 'telegram',
      groupId: null,
      content: 'First',
      contentType: 'text',
    });
    memory.recordMessage({
      conversationId,
      sourceNodeId: 'node1',
      senderId: 'user1',
      senderIsOwner: false,
      platform: 'telegram',
      groupId: null,
      content: 'Second',
      contentType: 'text',
    });

    const result = memory.getHistoryWithinBudget(conversationId, 500);
    expect(result).toHaveLength(2);
    expect(result[0]?.content).toBe('First');
    expect(result[1]?.content).toBe('Second');
  });

  it('returns empty array for unknown conversation', () => {
    const result = memory.getHistoryWithinBudget('nonexistent', 500);
    expect(result).toHaveLength(0);
  });

  it('returns empty array for zero budget', () => {
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

    const result = memory.getHistoryWithinBudget(conversationId, 0);
    expect(result).toHaveLength(0);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/orchestrator/__tests__/agent-memory.test.ts`
Expected: FAIL — `getHistoryWithinBudget` is not a function

**Step 3: Implement `estimateTokens` and `getHistoryWithinBudget`**

Add to `src/orchestrator/agent-memory.ts`:

Before the class declaration (after the type guards section), add the exported utility:

```typescript
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
```

Add as a method on `AgentMemory`, after `getRecentMessagesForContext`:

```typescript
getHistoryWithinBudget(conversationId: string, maxTokens: number): AgentMessage[] {
  if (maxTokens <= 0) return [];

  const rows: unknown[] = this.db
    .prepare(
      `SELECT * FROM agent_messages
       WHERE conversation_id = ?
       ORDER BY rowid DESC
       LIMIT 50`,
    )
    .all(conversationId);

  const allMessages = rows.filter(isAgentMessageRow).map(toAgentMessage);
  const result: AgentMessage[] = [];
  let tokenCount = 0;

  for (const msg of allMessages) {
    const msgTokens = estimateTokens(msg.content);
    if (tokenCount + msgTokens > maxTokens) break;
    tokenCount += msgTokens;
    result.push(msg);
  }

  return result.reverse();
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/orchestrator/__tests__/agent-memory.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/orchestrator/agent-memory.ts src/orchestrator/__tests__/agent-memory.test.ts
git commit -m "feat: add token-budget-aware history retrieval to AgentMemory"
```

---

### Task 2: Record bot replies in AgentMemory (Gap 1)

**Files:**

- Modify: `src/orchestrator/orchestrator.ts:394-396` (the `reply` case in `executeAction`)
- Test: `src/orchestrator/__tests__/orchestrator.test.ts`

**Step 1: Write the failing test**

Add a new `describe` block in `src/orchestrator/__tests__/orchestrator.test.ts`, after the `executeAction forward enrichment` describe:

```typescript
describe('executeAction reply recording', () => {
  let db: Database.Database;
  let registry: ChannelRegistry;
  let orchestrator: AgentOrchestrator;

  const graph = makeGraph();

  beforeEach(() => {
    db = new Database(':memory:');
    applySchema(db);
    registry = new ChannelRegistry();
    registry.sendTo = vi.fn().mockResolvedValue(undefined);

    orchestrator = new AgentOrchestrator({
      registry,
      graph,
      ownerIdentity: { telegram: { userId: 123 } },
      agentMemory: new AgentMemory(db),
    });
  });

  afterEach(() => {
    db.close();
  });

  it('records bot reply in agent memory', async () => {
    const agentMemory = new AgentMemory(db);
    const conversationId = agentMemory.getOrCreateConversation('telegram', null, ['n1']);

    const source: InboundMessage = {
      sourceNodeId: 'n1',
      platform: 'telegram',
      senderId: 'user123',
      senderIsOwner: true,
      groupId: null,
      content: 'Hello bot',
      contentType: 'text',
      timestamp: new Date().toISOString(),
    };

    await orchestrator.executeAction({ type: 'reply', content: 'Hello human' }, source);

    const history = agentMemory.getConversationHistory(conversationId, 10);
    expect(history).toHaveLength(1);
    expect(history[0]?.content).toBe('Hello human');
    expect(history[0]?.senderIsOwner).toBe(false);
  });
});
```

**Step 2: Run tests to verify it fails**

Run: `npx vitest run src/orchestrator/__tests__/orchestrator.test.ts`
Expected: FAIL — `history` has length 0 (reply not recorded)

**Step 3: Implement recording in the reply case**

In `src/orchestrator/orchestrator.ts`, modify the `reply` case in `executeAction` (currently lines 394-396):

Replace:

```typescript
case 'reply': {
  await this.registry.sendTo(source.sourceNodeId, action.content, source.groupId);
  break;
}
```

With:

```typescript
case 'reply': {
  await this.registry.sendTo(source.sourceNodeId, action.content, source.groupId);
  if (this.agentMemory) {
    const conversationId = this.agentMemory.getOrCreateConversation(
      source.platform,
      source.groupId,
      [source.sourceNodeId],
    );
    this.agentMemory.recordMessage({
      conversationId,
      sourceNodeId: source.sourceNodeId,
      senderId: source.sourceNodeId,
      senderIsOwner: false,
      platform: source.platform,
      groupId: source.groupId,
      content: action.content,
      contentType: 'text',
    });
  }
  break;
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/orchestrator/__tests__/orchestrator.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/orchestrator/orchestrator.ts src/orchestrator/__tests__/orchestrator.test.ts
git commit -m "feat: record bot replies in AgentMemory for conversation continuity"
```

---

### Task 3: Eliminate dual response in Telegram (Gap 2)

**Files:**

- Modify: `src/channels/telegram.ts:128-150` (`handleTextMessage`) and `200-201` (`handleVoice`)
- Test: Manual verification (Telegram channel tests require mocking grammy Bot)

**Step 1: Fix `handleTextMessage` — remove `handleAsk` when orchestrator handles it**

In `src/channels/telegram.ts`, replace the `handleTextMessage` method (lines 128-150):

Replace:

```typescript
private async handleTextMessage(ctx: Context, rawText: string): Promise<void> {
  const text = sanitizeChannelInput(rawText);
  await this.ingestText(text, 'telegram:text');

  const { onInbound, nodeId, ownerId } = this.deps;
  if (onInbound && nodeId) {
    const senderId = String(ctx.from?.id ?? 'unknown');
    const isOwner = Boolean(ownerId && ctx.from?.id === ownerId);
    const inbound: InboundMessage = {
      sourceNodeId: nodeId,
      platform: 'telegram',
      senderId,
      senderIsOwner: isOwner,
      groupId: ctx.chat?.id ? String(ctx.chat.id) : null,
      content: text,
      contentType: 'text',
      timestamp: new Date().toISOString(),
    };
    onInbound(inbound);
  }

  await this.handleAsk(ctx, text);
}
```

With:

```typescript
private async handleTextMessage(ctx: Context, rawText: string): Promise<void> {
  const text = sanitizeChannelInput(rawText);
  await this.ingestText(text, 'telegram:text');

  const { onInbound, nodeId, ownerId } = this.deps;
  if (onInbound && nodeId) {
    const senderId = String(ctx.from?.id ?? 'unknown');
    const isOwner = Boolean(ownerId && ctx.from?.id === ownerId);
    const inbound: InboundMessage = {
      sourceNodeId: nodeId,
      platform: 'telegram',
      senderId,
      senderIsOwner: isOwner,
      groupId: ctx.chat?.id ? String(ctx.chat.id) : null,
      content: text,
      contentType: 'text',
      timestamp: new Date().toISOString(),
    };
    onInbound(inbound);
    return;
  }

  await this.handleAsk(ctx, text);
}
```

Key change: add `return` after `onInbound(inbound)` so `handleAsk` is only called as fallback when there's no orchestrator.

**Step 2: Fix `handleVoice` — same pattern**

In `src/channels/telegram.ts`, in the `handleVoice` method (around line 198-201), replace:

```typescript
      onInbound(inbound);
    }

    await this.handleAsk(ctx, text);
```

With:

```typescript
      onInbound(inbound);
      return;
    }

    await this.handleAsk(ctx, text);
```

**Step 3: Run the full test suite to verify no regressions**

Run: `npx vitest run`
Expected: ALL PASS (no Telegram-specific tests exercise the dual-response path)

**Step 4: Commit**

```bash
git add src/channels/telegram.ts
git commit -m "fix: eliminate dual response in Telegram — single path through orchestrator"
```

---

### Task 4: Inject knowledge graph entities into routing prompt (Gap 3)

**Files:**

- Modify: `src/orchestrator/llm-router.ts:62-73` (store `db` on class), `146-244` (update `buildRoutingPrompt`)
- Test: `src/orchestrator/__tests__/llm-router.test.ts`

**Step 1: Write the failing test**

Add to `src/orchestrator/__tests__/llm-router.test.ts`, inside the `describe('decideRouting')` block:

```typescript
it('includes knowledge graph entities in the routing prompt when db has matches', async () => {
  // Seed the entities table with FTS-searchable data
  db.prepare(
    `INSERT INTO entities (id, type, name, summary, importance_score) VALUES (?, ?, ?, ?, ?)`,
  ).run('e1', 'person', 'Alice', 'Head of design team', 5);
  // Rebuild FTS index
  db.prepare(
    `INSERT INTO entities_fts (rowid, name, summary) SELECT rowid, name, summary FROM entities`,
  ).run();

  const responseJson = JSON.stringify({
    actions: [{ type: 'reply', content: 'Noted' }],
  });
  const router = createMockRouter(responseJson);
  const brain = new LLMRoutingBrain(router, db);
  const context = buildContext({
    message: buildMessage({
      content: 'What do we know about Alice from the design team?',
    }),
  });

  await brain.decideRouting(context);

  const reasonCalls = (router.reason as ReturnType<typeof vi.fn>).mock.calls;
  expect(reasonCalls.length).toBeGreaterThan(0);
  const messages = reasonCalls[0]![0] as Array<{ role: string; content: string }>;
  const systemPrompt = messages.find((m) => m.role === 'system')?.content ?? '';
  expect(systemPrompt).toContain('Known entities');
  expect(systemPrompt).toContain('Alice');
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/orchestrator/__tests__/llm-router.test.ts`
Expected: FAIL — system prompt does not contain 'Known entities'

**Step 3: Implement knowledge graph injection**

In `src/orchestrator/llm-router.ts`:

1. Add import at top (after existing imports):

```typescript
import { searchByKeyword } from '../db/search.js';
import { estimateTokens } from './agent-memory.js';
```

2. Store `db` on the class. Modify the constructor (lines 66-73):

Replace:

```typescript
constructor(
  private readonly router: ModelRouter,
  db: BetterSqlite3.Database,
  cacheTtlMs?: number,
) {
  this.cache = new RoutingCache(cacheTtlMs);
  this.memory = new AgentMemory(db);
}
```

With:

```typescript
constructor(
  private readonly router: ModelRouter,
  private readonly db: BetterSqlite3.Database,
  cacheTtlMs?: number,
) {
  this.cache = new RoutingCache(cacheTtlMs);
  this.memory = new AgentMemory(db);
}
```

3. Pass `db` to `buildRoutingPrompt`. In `decideRouting` (line 89):

Replace:

```typescript
const prompt = buildRoutingPrompt(context, this.memory);
```

With:

```typescript
const prompt = buildRoutingPrompt(context, this.memory, this.db);
```

4. Update `buildRoutingPrompt` signature and add knowledge graph section. Modify function signature (line 146):

Replace:

```typescript
function buildRoutingPrompt(context: RoutingContext, memory: AgentMemory): ChatMessage[] {
```

With:

```typescript
function buildRoutingPrompt(
  context: RoutingContext,
  memory: AgentMemory,
  db: BetterSqlite3.Database,
): ChatMessage[] {
```

5. Add knowledge graph context block. After the `peerMessagesText` block (after line 198), add:

```typescript
let knowledgeGraphText = '';
const entities = searchByKeyword(db, message.content, 5);
if (entities.length > 0) {
  const entityLines: string[] = [];
  let tokenCount = 0;
  const TOKEN_BUDGET_KNOWLEDGE = 400;
  for (const entity of entities) {
    const line = `- ${entity.name} (${entity.type}): ${entity.summary ?? 'no details'}`;
    const lineTokens = estimateTokens(line);
    if (tokenCount + lineTokens > TOKEN_BUDGET_KNOWLEDGE) break;
    tokenCount += lineTokens;
    entityLines.push(line);
  }
  if (entityLines.length > 0) {
    knowledgeGraphText = ['Known entities:', ...entityLines].join('\n');
  }
}
```

6. Inject into system prompt. In the `systemPrompt` array (around line 217-218), add after the workspace facts spread:

Replace:

```typescript
...(workspaceFactsText ? [workspaceFactsText, ''] : []),
...(peerMessagesText ? [peerMessagesText, ''] : []),
```

With:

```typescript
...(workspaceFactsText ? [workspaceFactsText, ''] : []),
...(knowledgeGraphText ? [knowledgeGraphText, ''] : []),
...(peerMessagesText ? [peerMessagesText, ''] : []),
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/orchestrator/__tests__/llm-router.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/orchestrator/llm-router.ts src/orchestrator/__tests__/llm-router.test.ts
git commit -m "feat: inject knowledge graph entities into LLM routing prompt"
```

---

### Task 5: Inject agent-level facts into routing prompt (Gap 4)

**Files:**

- Modify: `src/orchestrator/llm-router.ts:176-182` (add agent facts section in `buildRoutingPrompt`)
- Test: `src/orchestrator/__tests__/llm-router.test.ts`

**Step 1: Write the failing test**

Add to `src/orchestrator/__tests__/llm-router.test.ts`, inside `describe('decideRouting')`:

```typescript
it('includes agent-level facts in the routing prompt', async () => {
  const agentMemory = new AgentMemory(db);
  agentMemory.storeFact(
    'n1',
    null,
    'Customer prefers email communication',
    ['preferences'],
    'conversation',
  );
  agentMemory.storeFact('n1', null, 'Handles enterprise accounts', ['scope'], 'conversation');

  const responseJson = JSON.stringify({
    actions: [{ type: 'reply', content: 'Noted' }],
  });
  const router = createMockRouter(responseJson);
  const brain = new LLMRoutingBrain(router, db);
  const context = buildContext({
    message: buildMessage({
      content: 'What do you know about this customer?',
    }),
  });

  await brain.decideRouting(context);

  const reasonCalls = (router.reason as ReturnType<typeof vi.fn>).mock.calls;
  expect(reasonCalls.length).toBeGreaterThan(0);
  const messages = reasonCalls[0]![0] as Array<{ role: string; content: string }>;
  const systemPrompt = messages.find((m) => m.role === 'system')?.content ?? '';
  expect(systemPrompt).toContain('Agent knowledge');
  expect(systemPrompt).toContain('Customer prefers email communication');
  expect(systemPrompt).toContain('Handles enterprise accounts');
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/orchestrator/__tests__/llm-router.test.ts`
Expected: FAIL — system prompt does not contain 'Agent knowledge'

**Step 3: Implement agent facts injection**

In `src/orchestrator/llm-router.ts`, inside `buildRoutingPrompt`, after the `workspaceFactsText` block (after line 182), add:

```typescript
let agentFactsText = '';
const agentFacts = memory.getAgentFacts(sourceNode.id, 5);
if (agentFacts.length > 0) {
  agentFactsText = ['Agent knowledge:', ...agentFacts.map((f) => `- ${f}`)].join('\n');
}
```

Then in the system prompt array, inject it after workspace facts:

Replace:

```typescript
...(workspaceFactsText ? [workspaceFactsText, ''] : []),
...(knowledgeGraphText ? [knowledgeGraphText, ''] : []),
```

With:

```typescript
...(workspaceFactsText ? [workspaceFactsText, ''] : []),
...(agentFactsText ? [agentFactsText, ''] : []),
...(knowledgeGraphText ? [knowledgeGraphText, ''] : []),
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/orchestrator/__tests__/llm-router.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/orchestrator/llm-router.ts src/orchestrator/__tests__/llm-router.test.ts
git commit -m "feat: inject agent-level facts into LLM routing prompt"
```

---

### Task 6: Replace shallow history with token-budget-aware history (Gap 5)

**Files:**

- Modify: `src/orchestrator/llm-router.ts:166-174` (replace `getConversationHistory(id, 5)` with `getHistoryWithinBudget`)
- Test: `src/orchestrator/__tests__/llm-router.test.ts`

**Step 1: Write the failing test**

Add to `src/orchestrator/__tests__/llm-router.test.ts`, inside `describe('decideRouting')`:

```typescript
it('includes token-budget-aware conversation history in the routing prompt', async () => {
  const agentMemory = new AgentMemory(db);
  const conversationId = agentMemory.getOrCreateConversation('telegram', null, ['n1']);

  // Record several messages to populate history
  for (let i = 0; i < 8; i++) {
    agentMemory.recordMessage({
      conversationId,
      sourceNodeId: 'n1',
      senderId: 'user1',
      senderIsOwner: i % 2 === 0,
      platform: 'telegram',
      groupId: null,
      content: `Conversation message number ${i}`,
      contentType: 'text',
    });
  }

  const responseJson = JSON.stringify({
    actions: [{ type: 'reply', content: 'Noted' }],
  });
  const router = createMockRouter(responseJson);
  const brain = new LLMRoutingBrain(router, db);
  const context = buildContext({
    message: buildMessage({
      content: 'What were we discussing earlier today?',
    }),
    conversationId,
  });

  await brain.decideRouting(context);

  const reasonCalls = (router.reason as ReturnType<typeof vi.fn>).mock.calls;
  expect(reasonCalls.length).toBeGreaterThan(0);
  const messages = reasonCalls[0]![0] as Array<{ role: string; content: string }>;
  const systemPrompt = messages.find((m) => m.role === 'system')?.content ?? '';
  // Should contain multiple conversation messages (more than old limit of 5)
  expect(systemPrompt).toContain('Conversation message number');
  expect(systemPrompt).toContain('Recent conversation context');
});
```

**Step 2: Run test to verify it fails (or passes with old behavior)**

Run: `npx vitest run src/orchestrator/__tests__/llm-router.test.ts`
Expected: May pass but will only show 5 messages max. The real verification is Step 4.

**Step 3: Implement token-budget-aware history**

In `src/orchestrator/llm-router.ts`, replace the conversation context block (lines 166-174):

Replace:

```typescript
let conversationContext = '';
if (conversationId) {
  const recentMessages = memory.getConversationHistory(conversationId, 5);
  if (recentMessages.length > 0) {
    conversationContext = recentMessages
      .map((msg) => `[${msg.sourceNodeId}] ${msg.content}`)
      .join('\n');
  }
}
```

With:

```typescript
const TOKEN_BUDGET_HISTORY = 1500;
let conversationContext = '';
if (conversationId) {
  const recentMessages = memory.getHistoryWithinBudget(conversationId, TOKEN_BUDGET_HISTORY);
  if (recentMessages.length > 0) {
    conversationContext = recentMessages
      .map((msg) => `[${msg.sourceNodeId}] ${msg.content}`)
      .join('\n');
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/orchestrator/__tests__/llm-router.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/orchestrator/llm-router.ts src/orchestrator/__tests__/llm-router.test.ts
git commit -m "feat: replace shallow history limit with token-budget-aware retrieval"
```

---

### Task 7: Fix cache key to include conversationId (Gap 6)

**Files:**

- Modify: `src/orchestrator/routing-cache.ts:11-14` (update `buildCacheKey`)
- Modify: `src/orchestrator/llm-router.ts:83` (update call site)
- Test: `src/orchestrator/__tests__/routing-cache.test.ts`

**Step 1: Write the failing test**

Add to `src/orchestrator/__tests__/routing-cache.test.ts`, inside `describe('buildCacheKey')`:

```typescript
it('includes conversationId in cache key', () => {
  const key1 = buildCacheKey('node1', 'hello', 'conv1');
  const key2 = buildCacheKey('node1', 'hello', 'conv2');
  expect(key1).not.toBe(key2);
});

it('handles null conversationId', () => {
  const key1 = buildCacheKey('node1', 'hello', null);
  const key2 = buildCacheKey('node1', 'hello', null);
  expect(key1).toBe(key2);
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/orchestrator/__tests__/routing-cache.test.ts`
Expected: FAIL — `buildCacheKey` does not accept 3 arguments

**Step 3: Update `buildCacheKey` signature**

In `src/orchestrator/routing-cache.ts`, replace the function (line 11-14):

Replace:

```typescript
export function buildCacheKey(sourceNodeId: string, content: string): string {
  const truncated = content.slice(0, 100);
  return `${sourceNodeId}:${truncated}`;
}
```

With:

```typescript
export function buildCacheKey(
  sourceNodeId: string,
  content: string,
  conversationId: string | null = null,
): string {
  const truncated = content.slice(0, 100);
  return `${sourceNodeId}:${conversationId ?? ''}:${truncated}`;
}
```

**Step 4: Update call site in `llm-router.ts`**

In `src/orchestrator/llm-router.ts`, update the cache key call (line 83):

Replace:

```typescript
const cacheKey = buildCacheKey(message.sourceNodeId, message.content);
```

With:

```typescript
const cacheKey = buildCacheKey(message.sourceNodeId, message.content, context.conversationId);
```

**Step 5: Run all tests to verify**

Run: `npx vitest run src/orchestrator/__tests__/routing-cache.test.ts src/orchestrator/__tests__/llm-router.test.ts`
Expected: ALL PASS

**Step 6: Commit**

```bash
git add src/orchestrator/routing-cache.ts src/orchestrator/llm-router.ts src/orchestrator/__tests__/routing-cache.test.ts
git commit -m "fix: include conversationId in routing cache key for context-aware caching"
```

---

### Task 8: Run full test suite, typecheck, and build

**Files:** None (verification only)

**Step 1: Run full test suite**

Run: `npx vitest run`
Expected: ALL PASS

**Step 2: Run TypeScript type check**

Run: `npx tsc --noEmit`
Expected: No new errors (pre-existing errors in `embeddings.ts` are acceptable)

**Step 3: Run formatter**

Run: `npx prettier --check "src/orchestrator/**/*.ts" "src/channels/telegram.ts"`
If failures: `npx prettier --write <failing-files>`

**Step 4: Build daemon**

Run: `npm run build`
Expected: Clean build

**Step 5: Commit any format fixes**

```bash
git add -A
git commit -m "chore: format and verify build"
```
