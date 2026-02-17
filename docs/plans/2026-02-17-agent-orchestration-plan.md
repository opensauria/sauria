# Agent Orchestration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform OpenWind from a single-channel Telegram bot into a multi-agent company engine where AI agents collaborate across platforms through group chats, shared knowledge, and task delegation, with the user as CEO.

**Architecture:** Orchestrator pattern with ChannelRegistry, per-workspace message queues, hybrid local/cloud model routing, and worker thread isolation. Canvas UI gets workspace frames, agent detail panels, and CEO command bar.

**Tech Stack:** TypeScript strict, Node.js worker_threads, SQLite WAL mode, grammy (Telegram), zod validation, vitest for tests.

**Design doc:** `docs/plans/2026-02-17-agent-orchestration-design.md`

---

## Phase 1: Foundation Types and Database Schema

### Task 1: Core type definitions

**Files:**
- Create: `src/orchestrator/types.ts`

**Step 1: Write type definitions**

```typescript
import type { z } from 'zod';

// ─── Agent Roles & Autonomy ────────────────────────────────────────

export type AgentRole = 'lead' | 'specialist' | 'observer' | 'bridge' | 'assistant';

export type AutonomyLevel = 'full' | 'supervised' | 'approval' | 'manual';

export type Platform = 'telegram' | 'slack' | 'whatsapp';

// ─── Group Behavior ────────────────────────────────────────────────

export interface ProactiveBehavior {
  readonly reportStatus: 'daily' | 'on_change' | 'never';
  readonly shareInsights: boolean;
  readonly askForHelp: boolean;
  readonly announceTaskCompletion: boolean;
}

export interface CeoResponseBehavior {
  readonly acknowledgeOrders: boolean;
  readonly askClarification: boolean;
  readonly reportProgress: boolean;
}

export interface PeerBehavior {
  readonly canRequestHelp: boolean;
  readonly canDelegateTasks: boolean;
  readonly shareContext: boolean;
}

export interface GroupBehavior {
  readonly proactive: ProactiveBehavior;
  readonly ceoResponse: CeoResponseBehavior;
  readonly peer: PeerBehavior;
}

// ─── Workspace ─────────────────────────────────────────────────────

export interface WorkspaceGroup {
  readonly platform: Platform;
  readonly groupId: string;
  readonly name: string;
  readonly ceoMemberId: string;
  readonly autoCreated: boolean;
}

export interface Checkpoint {
  readonly condition: 'between_teams' | 'high_cost' | 'external_action';
  readonly approverChannel: string;
}

export interface WorkspaceModels {
  readonly extraction?: string;
  readonly reasoning?: string;
  readonly deep?: string;
}

export interface WorkspaceBudget {
  readonly dailyLimitUsd: number;
  readonly preferCheap: boolean;
}

export interface Workspace {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  readonly purpose: string;
  readonly topics: readonly string[];
  readonly budget: WorkspaceBudget;
  readonly models?: WorkspaceModels;
  readonly position: { readonly x: number; readonly y: number };
  readonly size: { readonly width: number; readonly height: number };
  readonly checkpoints: readonly Checkpoint[];
  readonly groups: readonly WorkspaceGroup[];
}

// ─── Agent Node (extended) ─────────────────────────────────────────

export interface AgentNode {
  readonly id: string;
  readonly platform: Platform;
  readonly label: string;
  readonly photo: string | null;
  readonly position: { readonly x: number; readonly y: number };
  readonly status: 'connected' | 'disconnected' | 'error';
  readonly credentials: string;
  readonly meta: Readonly<Record<string, string>>;
  readonly workspaceId: string | null;
  readonly role: AgentRole;
  readonly autonomy: AutonomyLevel;
  readonly instructions: string;
  readonly groupBehavior: GroupBehavior;
}

// ─── Edge (extended) ───────────────────────────────────────────────

export type EdgeRuleType = 'always' | 'keyword' | 'priority' | 'llm_decided';
export type EdgeAction = 'forward' | 'assign' | 'notify' | 'send_to_all';

export interface EdgeRule {
  readonly type: EdgeRuleType;
  readonly condition?: string;
  readonly action: EdgeAction;
}

export interface Edge {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly label?: string;
  readonly edgeType: 'intra_workspace' | 'cross_workspace' | 'manual';
  readonly rules: readonly EdgeRule[];
}

// ─── Canvas Graph v2 ───────────────────────────────────────────────

export interface CanvasGraph {
  readonly version: 2;
  readonly workspaces: readonly Workspace[];
  readonly nodes: readonly AgentNode[];
  readonly edges: readonly Edge[];
  readonly viewport: { readonly x: number; readonly y: number; readonly zoom: number };
}

// ─── CEO Identity ──────────────────────────────────────────────────

export interface CEOIdentity {
  readonly telegram?: { readonly userId: number };
  readonly slack?: { readonly userId: string };
  readonly whatsapp?: { readonly phoneNumber: string };
}

// ─── Messages ──────────────────────────────────────────────────────

export interface InboundMessage {
  readonly sourceNodeId: string;
  readonly platform: Platform;
  readonly senderId: string;
  readonly senderIsCeo: boolean;
  readonly groupId: string | null;
  readonly content: string;
  readonly contentType: 'text' | 'voice' | 'image';
  readonly timestamp: string;
}

export type RoutingAction =
  | { readonly type: 'reply'; readonly content: string }
  | { readonly type: 'forward'; readonly targetNodeId: string; readonly content: string }
  | { readonly type: 'assign'; readonly targetNodeId: string; readonly task: string; readonly priority: 'low' | 'normal' | 'high' }
  | { readonly type: 'notify'; readonly targetNodeId: string; readonly summary: string }
  | { readonly type: 'send_to_all'; readonly workspaceId: string; readonly content: string }
  | { readonly type: 'learn'; readonly fact: string; readonly topics: readonly string[] }
  | { readonly type: 'checkpoint'; readonly description: string; readonly pendingActions: readonly RoutingAction[] }
  | { readonly type: 'group_message'; readonly workspaceId: string; readonly content: string };

export interface RoutingDecision {
  readonly actions: readonly RoutingAction[];
}

// ─── Agent Runtime ─────────────────────────────────────────────────

export interface KPI {
  readonly name: string;
  readonly target: number;
  current: number;
  readonly unit: string;
}

export interface AgentPerformance {
  messagesHandled: number;
  tasksCompleted: number;
  avgResponseTimeMs: number;
  costIncurredUsd: number;
}

// ─── CEO Commands ──────────────────────────────────────────────────

export type CEOCommand =
  | { readonly type: 'instruct'; readonly agentId: string; readonly instruction: string }
  | { readonly type: 'reassign'; readonly agentId: string; readonly newWorkspaceId: string }
  | { readonly type: 'promote'; readonly agentId: string; readonly newAutonomy: AutonomyLevel }
  | { readonly type: 'pause'; readonly workspaceId: string }
  | { readonly type: 'broadcast'; readonly message: string }
  | { readonly type: 'review'; readonly agentId: string }
  | { readonly type: 'hire'; readonly platform: Platform; readonly workspace: string; readonly role: AgentRole }
  | { readonly type: 'fire'; readonly agentId: string };

// ─── Default Factories ─────────────────────────────────────────────

export const DEFAULT_GROUP_BEHAVIOR: GroupBehavior = {
  proactive: {
    reportStatus: 'on_change',
    shareInsights: true,
    askForHelp: true,
    announceTaskCompletion: true,
  },
  ceoResponse: {
    acknowledgeOrders: true,
    askClarification: true,
    reportProgress: true,
  },
  peer: {
    canRequestHelp: true,
    canDelegateTasks: false,
    shareContext: true,
  },
};

export function createEmptyGraph(): CanvasGraph {
  return { version: 2, workspaces: [], nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } };
}
```

**Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (no imports from this file yet, pure types)

**Step 3: Commit**

```bash
git add src/orchestrator/types.ts
git commit -m "feat: add core type definitions for agent orchestration"
```

---

### Task 2: Extend database schema for agent messaging

**Files:**
- Modify: `src/db/schema.ts` (add tables after line 63)

**Step 1: Write test for new tables**

Create: `src/db/__tests__/orchestrator-schema.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { applySchema } from '../schema.js';

describe('orchestrator schema', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    applySchema(db);
  });

  afterEach(() => {
    db.close();
  });

  it('creates agent_messages table', () => {
    const info = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='agent_messages'").get();
    expect(info).toBeTruthy();
  });

  it('creates agent_conversations table', () => {
    const info = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='agent_conversations'").get();
    expect(info).toBeTruthy();
  });

  it('creates agent_tasks table', () => {
    const info = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='agent_tasks'").get();
    expect(info).toBeTruthy();
  });

  it('creates agent_memory table', () => {
    const info = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='agent_memory'").get();
    expect(info).toBeTruthy();
  });

  it('inserts and retrieves an agent message', () => {
    db.prepare(`INSERT INTO agent_messages (id, conversation_id, source_node_id, sender_id, sender_is_ceo, platform, content, content_type)
      VALUES ('m1', 'c1', 'node1', 'user1', 1, 'telegram', 'hello', 'text')`).run();
    const row = db.prepare('SELECT * FROM agent_messages WHERE id = ?').get('m1') as Record<string, unknown>;
    expect(row['content']).toBe('hello');
    expect(row['sender_is_ceo']).toBe(1);
  });

  it('inserts and retrieves an agent task', () => {
    db.prepare(`INSERT INTO agent_tasks (id, workspace_id, assigned_to, title, priority, status)
      VALUES ('t1', 'ws1', 'node1', 'Fix billing', 'high', 'pending')`).run();
    const row = db.prepare('SELECT * FROM agent_tasks WHERE id = ?').get('t1') as Record<string, unknown>;
    expect(row['title']).toBe('Fix billing');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/db/__tests__/orchestrator-schema.test.ts`
Expected: FAIL (tables don't exist yet)

**Step 3: Add schema tables to `src/db/schema.ts`**

Add before the closing backtick of `SCHEMA_SQL` (before line 95):

```sql
  CREATE TABLE IF NOT EXISTS agent_messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    source_node_id TEXT NOT NULL,
    sender_id TEXT NOT NULL,
    sender_is_ceo INTEGER NOT NULL DEFAULT 0,
    platform TEXT NOT NULL,
    group_id TEXT,
    content TEXT NOT NULL,
    content_type TEXT NOT NULL DEFAULT 'text',
    routing_decision JSON,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS agent_conversations (
    id TEXT PRIMARY KEY,
    workspace_id TEXT,
    platform TEXT NOT NULL,
    group_id TEXT,
    participant_node_ids JSON NOT NULL DEFAULT '[]',
    last_message_at TEXT NOT NULL DEFAULT (datetime('now')),
    message_count INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS agent_tasks (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    assigned_to TEXT NOT NULL,
    delegated_by TEXT,
    title TEXT NOT NULL,
    description TEXT,
    priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','critical')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','completed','cancelled')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS agent_memory (
    id TEXT PRIMARY KEY,
    node_id TEXT NOT NULL,
    workspace_id TEXT,
    fact TEXT NOT NULL,
    topics JSON NOT NULL DEFAULT '[]',
    source TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_agent_messages_conversation ON agent_messages(conversation_id);
  CREATE INDEX IF NOT EXISTS idx_agent_messages_source_node ON agent_messages(source_node_id);
  CREATE INDEX IF NOT EXISTS idx_agent_messages_created ON agent_messages(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_agent_conversations_workspace ON agent_conversations(workspace_id);
  CREATE INDEX IF NOT EXISTS idx_agent_tasks_workspace ON agent_tasks(workspace_id);
  CREATE INDEX IF NOT EXISTS idx_agent_tasks_assigned ON agent_tasks(assigned_to);
  CREATE INDEX IF NOT EXISTS idx_agent_tasks_status ON agent_tasks(status);
  CREATE INDEX IF NOT EXISTS idx_agent_memory_node ON agent_memory(node_id);
  CREATE INDEX IF NOT EXISTS idx_agent_memory_workspace ON agent_memory(workspace_id);
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/db/__tests__/orchestrator-schema.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/db/schema.ts src/db/__tests__/orchestrator-schema.test.ts
git commit -m "feat: add database schema for agent messaging and tasks"
```

---

### Task 3: Extend config schema with workspace and CEO identity

**Files:**
- Modify: `src/config/schema.ts`

**Step 1: Write test**

Create: `src/config/__tests__/workspace-schema.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { OpenWindConfigSchema } from '../schema.js';

describe('workspace config schema', () => {
  it('accepts config with ceo identity', () => {
    const config = OpenWindConfigSchema.parse({
      ceo: { telegram: { userId: 123456 } },
    });
    expect(config.ceo.telegram?.userId).toBe(123456);
  });

  it('defaults ceo to empty object', () => {
    const config = OpenWindConfigSchema.parse({});
    expect(config.ceo).toEqual({});
  });

  it('accepts orchestrator config with model tiers', () => {
    const config = OpenWindConfigSchema.parse({
      orchestrator: {
        localModel: { engine: 'ollama', model: 'llama3.2', useGpu: true },
        maxConcurrentWorkspaces: 8,
      },
    });
    expect(config.orchestrator.localModel?.engine).toBe('ollama');
    expect(config.orchestrator.maxConcurrentWorkspaces).toBe(8);
  });

  it('defaults orchestrator settings', () => {
    const config = OpenWindConfigSchema.parse({});
    expect(config.orchestrator.maxConcurrentWorkspaces).toBe(4);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/config/__tests__/workspace-schema.test.ts`
Expected: FAIL

**Step 3: Add schemas to `src/config/schema.ts`**

Add before `ChannelsConfigSchema` definition:

```typescript
const CEOIdentitySchema = z
  .object({
    telegram: z.object({ userId: z.number().int() }).optional(),
    slack: z.object({ userId: z.string() }).optional(),
    whatsapp: z.object({ phoneNumber: z.string() }).optional(),
  })
  .default({});

const LocalModelSchema = z.object({
  engine: z.enum(['ollama', 'llamacpp', 'mlx']),
  model: z.string().min(1),
  useGpu: z.boolean().default(true),
});

const OrchestratorConfigSchema = z
  .object({
    localModel: LocalModelSchema.optional(),
    maxConcurrentWorkspaces: z.number().int().min(1).max(32).default(4),
    maxMessagesPerSecond: z.number().int().min(1).max(100).default(10),
    routingCacheTtlMs: z.number().int().min(0).max(600_000).default(300_000),
  })
  .default({});
```

Add `ceo` and `orchestrator` to `OpenWindConfigSchema`:

```typescript
ceo: CEOIdentitySchema,
orchestrator: OrchestratorConfigSchema,
```

Export new types:

```typescript
export type CEOIdentityConfig = z.infer<typeof CEOIdentitySchema>;
export type OrchestratorConfig = z.infer<typeof OrchestratorConfigSchema>;
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/config/__tests__/workspace-schema.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/config/schema.ts src/config/__tests__/workspace-schema.test.ts
git commit -m "feat: add CEO identity and orchestrator config schemas"
```

---

## Phase 2: Channel Abstraction Layer

### Task 4: Extend Channel interface and create ChannelRegistry

**Files:**
- Modify: `src/channels/base.ts` (extend Channel interface)
- Create: `src/channels/registry.ts`

**Step 1: Write test for ChannelRegistry**

Create: `src/channels/__tests__/registry.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChannelRegistry } from '../registry.js';
import type { Channel } from '../base.js';

function mockChannel(name: string): Channel {
  return {
    name,
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    sendAlert: vi.fn().mockResolvedValue(undefined),
    sendMessage: vi.fn().mockResolvedValue(undefined),
    sendToGroup: vi.fn().mockResolvedValue(undefined),
  };
}

describe('ChannelRegistry', () => {
  let registry: ChannelRegistry;

  beforeEach(() => {
    registry = new ChannelRegistry();
  });

  it('registers and retrieves a channel by nodeId', () => {
    const ch = mockChannel('telegram');
    registry.register('node-1', ch);
    expect(registry.get('node-1')).toBe(ch);
  });

  it('returns null for unknown nodeId', () => {
    expect(registry.get('unknown')).toBeNull();
  });

  it('unregisters a channel', () => {
    const ch = mockChannel('telegram');
    registry.register('node-1', ch);
    registry.unregister('node-1');
    expect(registry.get('node-1')).toBeNull();
  });

  it('lists all registered channels', () => {
    registry.register('n1', mockChannel('telegram'));
    registry.register('n2', mockChannel('slack'));
    const all = registry.getAll();
    expect(all).toHaveLength(2);
  });

  it('sends message to a specific node', async () => {
    const ch = mockChannel('telegram');
    registry.register('n1', ch);
    await registry.sendTo('n1', 'hello', null);
    expect(ch.sendMessage).toHaveBeenCalledWith('hello', null);
  });

  it('throws when sending to unknown node', async () => {
    await expect(registry.sendTo('unknown', 'hello', null)).rejects.toThrow();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/channels/__tests__/registry.test.ts`
Expected: FAIL

**Step 3: Extend Channel interface in `src/channels/base.ts`**

Add to the `Channel` interface:

```typescript
export interface Channel {
  readonly name: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  sendAlert(alert: ProactiveAlert): Promise<void>;
  sendMessage(content: string, groupId: string | null): Promise<void>;
  sendToGroup(groupId: string, content: string): Promise<void>;
}
```

**Step 4: Create `src/channels/registry.ts`**

```typescript
import type { Channel } from './base.js';
import type { CanvasGraph } from '../orchestrator/types.js';

export class ChannelRegistry {
  private readonly channels = new Map<string, Channel>();

  register(nodeId: string, channel: Channel): void {
    this.channels.set(nodeId, channel);
  }

  unregister(nodeId: string): void {
    this.channels.delete(nodeId);
  }

  get(nodeId: string): Channel | null {
    return this.channels.get(nodeId) ?? null;
  }

  getAll(): Array<{ nodeId: string; channel: Channel }> {
    return [...this.channels.entries()].map(([nodeId, channel]) => ({ nodeId, channel }));
  }

  async sendTo(nodeId: string, content: string, groupId: string | null): Promise<void> {
    const channel = this.channels.get(nodeId);
    if (!channel) {
      throw new Error(`No channel registered for node: ${nodeId}`);
    }
    await channel.sendMessage(content, groupId);
  }

  async sendToGroup(nodeId: string, groupId: string, content: string): Promise<void> {
    const channel = this.channels.get(nodeId);
    if (!channel) {
      throw new Error(`No channel registered for node: ${nodeId}`);
    }
    await channel.sendToGroup(groupId, content);
  }

  async sendToWorkspace(workspaceId: string, content: string, graph: CanvasGraph): Promise<void> {
    const workspaceNodes = graph.nodes.filter((n) => n.workspaceId === workspaceId);
    const workspace = graph.workspaces.find((w) => w.id === workspaceId);

    for (const node of workspaceNodes) {
      const channel = this.channels.get(node.id);
      if (!channel) continue;

      const group = workspace?.groups.find((g) => g.platform === node.platform);
      if (group) {
        await channel.sendToGroup(group.groupId, content);
      }
    }
  }

  async stopAll(): Promise<void> {
    for (const channel of this.channels.values()) {
      await channel.stop();
    }
    this.channels.clear();
  }
}
```

**Step 5: Run test to verify it passes**

Run: `npx vitest run src/channels/__tests__/registry.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add src/channels/base.ts src/channels/registry.ts src/channels/__tests__/registry.test.ts
git commit -m "feat: add ChannelRegistry and extend Channel interface with sendMessage"
```

---

## Phase 3: Orchestrator Core

### Task 5: Circuit breaker

**Files:**
- Create: `src/orchestrator/circuit-breaker.ts`

**Step 1: Write test**

Create: `src/orchestrator/__tests__/circuit-breaker.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CircuitBreaker } from '../circuit-breaker.js';

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker(3, 1000);
  });

  it('starts closed and executes normally', async () => {
    const result = await breaker.execute(() => Promise.resolve('ok'));
    expect(result).toBe('ok');
    expect(breaker.getState()).toBe('closed');
  });

  it('opens after threshold failures', async () => {
    const fail = () => Promise.reject(new Error('fail'));
    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute(fail)).rejects.toThrow('fail');
    }
    expect(breaker.getState()).toBe('open');
  });

  it('rejects immediately when open', async () => {
    const fail = () => Promise.reject(new Error('fail'));
    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute(fail)).rejects.toThrow();
    }
    await expect(breaker.execute(() => Promise.resolve('ok'))).rejects.toThrow('Circuit open');
  });

  it('resets after successful execution', async () => {
    const fail = () => Promise.reject(new Error('fail'));
    await expect(breaker.execute(fail)).rejects.toThrow();
    await expect(breaker.execute(fail)).rejects.toThrow();
    // 2 failures, not yet open
    expect(breaker.getState()).toBe('closed');
    await breaker.execute(() => Promise.resolve('ok'));
    expect(breaker.getState()).toBe('closed');
  });
});
```

**Step 2: Run test, verify fail, implement, verify pass**

```typescript
// src/orchestrator/circuit-breaker.ts
type CircuitState = 'closed' | 'open' | 'half_open';

export class CircuitBreaker {
  private failures = 0;
  private state: CircuitState = 'closed';
  private openedAt = 0;

  constructor(
    private readonly threshold: number,
    private readonly resetTimeoutMs: number,
  ) {}

  getState(): CircuitState {
    if (this.state === 'open' && Date.now() - this.openedAt >= this.resetTimeoutMs) {
      this.state = 'half_open';
    }
    return this.state;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const currentState = this.getState();

    if (currentState === 'open') {
      throw new Error('Circuit open — channel temporarily unavailable');
    }

    try {
      const result = await fn();
      this.reset();
      return result;
    } catch (err) {
      this.failures++;
      if (this.failures >= this.threshold) {
        this.state = 'open';
        this.openedAt = Date.now();
      }
      throw err;
    }
  }

  private reset(): void {
    this.failures = 0;
    this.state = 'closed';
  }
}
```

**Step 3: Commit**

```bash
git add src/orchestrator/circuit-breaker.ts src/orchestrator/__tests__/circuit-breaker.test.ts
git commit -m "feat: add circuit breaker for channel resilience"
```

---

### Task 6: Message queue with backpressure

**Files:**
- Create: `src/orchestrator/message-queue.ts`

**Step 1: Write test**

Create: `src/orchestrator/__tests__/message-queue.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MessageQueue } from '../message-queue.js';
import type { InboundMessage } from '../types.js';

function makeMessage(content: string): InboundMessage {
  return {
    sourceNodeId: 'node-1',
    platform: 'telegram',
    senderId: 'user-1',
    senderIsCeo: false,
    groupId: null,
    content,
    contentType: 'text',
    timestamp: new Date().toISOString(),
  };
}

describe('MessageQueue', () => {
  let queue: MessageQueue;
  let handler: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    handler = vi.fn().mockResolvedValue(undefined);
    queue = new MessageQueue(handler, { maxConcurrent: 2, maxQueueSize: 10 });
  });

  afterEach(() => {
    queue.stop();
  });

  it('processes enqueued messages', async () => {
    queue.enqueue(makeMessage('hello'));
    await queue.flush();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('reports pending count', () => {
    queue.enqueue(makeMessage('a'));
    queue.enqueue(makeMessage('b'));
    expect(queue.pending).toBe(2);
  });

  it('rejects when queue is full', () => {
    const small = new MessageQueue(handler, { maxConcurrent: 1, maxQueueSize: 2 });
    small.enqueue(makeMessage('a'));
    small.enqueue(makeMessage('b'));
    expect(() => small.enqueue(makeMessage('c'))).toThrow('Queue full');
    small.stop();
  });

  it('prioritizes CEO messages', async () => {
    const order: string[] = [];
    const slowHandler = vi.fn().mockImplementation(async (msg: InboundMessage) => {
      order.push(msg.content);
    });
    const q = new MessageQueue(slowHandler, { maxConcurrent: 1, maxQueueSize: 10 });
    q.enqueue(makeMessage('normal'));
    q.enqueue({ ...makeMessage('ceo'), senderIsCeo: true });
    await q.flush();
    expect(order[0]).toBe('ceo');
    q.stop();
  });
});
```

**Step 2: Implement**

```typescript
// src/orchestrator/message-queue.ts
import type { InboundMessage } from './types.js';

export type MessageHandler = (message: InboundMessage) => Promise<void>;

interface QueueOptions {
  readonly maxConcurrent: number;
  readonly maxQueueSize: number;
}

export class MessageQueue {
  private readonly queue: InboundMessage[] = [];
  private processing = 0;
  private stopped = false;

  constructor(
    private readonly handler: MessageHandler,
    private readonly options: QueueOptions,
  ) {}

  get pending(): number {
    return this.queue.length;
  }

  get active(): number {
    return this.processing;
  }

  enqueue(message: InboundMessage): void {
    if (this.queue.length >= this.options.maxQueueSize) {
      throw new Error('Queue full — backpressure active');
    }

    if (message.senderIsCeo) {
      this.queue.unshift(message);
    } else {
      this.queue.push(message);
    }

    void this.drain();
  }

  async flush(): Promise<void> {
    while (this.queue.length > 0 || this.processing > 0) {
      await this.drain();
      if (this.processing > 0) {
        await new Promise((r) => setTimeout(r, 10));
      }
    }
  }

  stop(): void {
    this.stopped = true;
    this.queue.length = 0;
  }

  private async drain(): Promise<void> {
    while (
      !this.stopped &&
      this.queue.length > 0 &&
      this.processing < this.options.maxConcurrent
    ) {
      const message = this.queue.shift();
      if (!message) break;

      this.processing++;
      this.handler(message)
        .catch(() => {})
        .finally(() => {
          this.processing--;
          void this.drain();
        });
    }
  }
}
```

**Step 3: Run test, verify pass, commit**

```bash
git add src/orchestrator/message-queue.ts src/orchestrator/__tests__/message-queue.test.ts
git commit -m "feat: add message queue with CEO priority and backpressure"
```

---

### Task 7: Edge rule evaluator

**Files:**
- Create: `src/orchestrator/routing.ts`

**Step 1: Write test**

Create: `src/orchestrator/__tests__/routing.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { evaluateEdgeRules } from '../routing.js';
import type { AgentNode, Edge, InboundMessage } from '../types.js';
import { DEFAULT_GROUP_BEHAVIOR } from '../types.js';

const baseNode: AgentNode = {
  id: 'n1', platform: 'telegram', label: '@bot', photo: null,
  position: { x: 0, y: 0 }, status: 'connected', credentials: 'key',
  meta: {}, workspaceId: 'ws1', role: 'assistant', autonomy: 'supervised',
  instructions: '', groupBehavior: DEFAULT_GROUP_BEHAVIOR,
};

const baseMessage: InboundMessage = {
  sourceNodeId: 'n1', platform: 'telegram', senderId: 'u1',
  senderIsCeo: false, groupId: null, content: 'hello billing issue',
  contentType: 'text', timestamp: new Date().toISOString(),
};

describe('evaluateEdgeRules', () => {
  it('returns empty for no outgoing edges', () => {
    const actions = evaluateEdgeRules(baseNode, baseMessage, []);
    expect(actions).toHaveLength(0);
  });

  it('triggers always-forward rule', () => {
    const edges: Edge[] = [{
      id: 'e1', from: 'n1', to: 'n2', edgeType: 'manual',
      rules: [{ type: 'always', action: 'forward' }],
    }];
    const actions = evaluateEdgeRules(baseNode, baseMessage, edges);
    expect(actions).toHaveLength(1);
    expect(actions[0]?.type).toBe('forward');
  });

  it('triggers keyword rule when content matches', () => {
    const edges: Edge[] = [{
      id: 'e1', from: 'n1', to: 'n2', edgeType: 'manual',
      rules: [{ type: 'keyword', condition: 'billing', action: 'notify' }],
    }];
    const actions = evaluateEdgeRules(baseNode, baseMessage, edges);
    expect(actions).toHaveLength(1);
    expect(actions[0]?.type).toBe('notify');
  });

  it('skips keyword rule when content does not match', () => {
    const edges: Edge[] = [{
      id: 'e1', from: 'n1', to: 'n2', edgeType: 'manual',
      rules: [{ type: 'keyword', condition: 'shipping', action: 'notify' }],
    }];
    const actions = evaluateEdgeRules(baseNode, baseMessage, edges);
    expect(actions).toHaveLength(0);
  });

  it('skips llm_decided rules (handled separately)', () => {
    const edges: Edge[] = [{
      id: 'e1', from: 'n1', to: 'n2', edgeType: 'manual',
      rules: [{ type: 'llm_decided', action: 'forward' }],
    }];
    const actions = evaluateEdgeRules(baseNode, baseMessage, edges);
    expect(actions).toHaveLength(0);
  });
});
```

**Step 2: Implement**

```typescript
// src/orchestrator/routing.ts
import type { AgentNode, Edge, InboundMessage, RoutingAction } from './types.js';

export function evaluateEdgeRules(
  sourceNode: AgentNode,
  message: InboundMessage,
  edges: readonly Edge[],
): RoutingAction[] {
  const outgoing = edges.filter((e) => e.from === sourceNode.id);
  const actions: RoutingAction[] = [];

  for (const edge of outgoing) {
    for (const rule of edge.rules) {
      if (rule.type === 'llm_decided') continue;

      if (rule.type === 'always') {
        actions.push(buildAction(rule.action, edge.to, message.content));
        continue;
      }

      if (rule.type === 'keyword' && rule.condition) {
        const lowerContent = message.content.toLowerCase();
        const lowerCondition = rule.condition.toLowerCase();
        if (lowerContent.includes(lowerCondition)) {
          actions.push(buildAction(rule.action, edge.to, message.content));
        }
        continue;
      }

      if (rule.type === 'priority' && rule.condition) {
        // Priority rules checked against message metadata (future extension)
        continue;
      }
    }
  }

  return actions;
}

function buildAction(action: string, targetNodeId: string, content: string): RoutingAction {
  switch (action) {
    case 'forward':
      return { type: 'forward', targetNodeId, content };
    case 'assign':
      return { type: 'assign', targetNodeId, task: content, priority: 'normal' };
    case 'notify':
      return { type: 'notify', targetNodeId, summary: content };
    case 'send_to_all':
      return { type: 'send_to_all', workspaceId: targetNodeId, content };
    default:
      return { type: 'forward', targetNodeId, content };
  }
}
```

**Step 3: Run test, verify pass, commit**

```bash
git add src/orchestrator/routing.ts src/orchestrator/__tests__/routing.test.ts
git commit -m "feat: add deterministic edge rule evaluator"
```

---

### Task 8: AgentOrchestrator core

**Files:**
- Create: `src/orchestrator/orchestrator.ts`

**Step 1: Write test**

Create: `src/orchestrator/__tests__/orchestrator.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentOrchestrator } from '../orchestrator.js';
import type { CanvasGraph, InboundMessage, CEOIdentity } from '../types.js';
import { DEFAULT_GROUP_BEHAVIOR, createEmptyGraph } from '../types.js';
import { ChannelRegistry } from '../../channels/registry.js';

function makeGraph(): CanvasGraph {
  return {
    ...createEmptyGraph(),
    workspaces: [{
      id: 'ws1', name: 'Support', color: '#ff0000', purpose: 'Handle support',
      topics: ['support'], budget: { dailyLimitUsd: 5, preferCheap: true },
      position: { x: 0, y: 0 }, size: { width: 400, height: 300 },
      checkpoints: [], groups: [],
    }],
    nodes: [{
      id: 'n1', platform: 'telegram', label: '@support_bot', photo: null,
      position: { x: 0, y: 0 }, status: 'connected', credentials: 'key',
      meta: {}, workspaceId: 'ws1', role: 'assistant', autonomy: 'supervised',
      instructions: '', groupBehavior: DEFAULT_GROUP_BEHAVIOR,
    }],
  };
}

describe('AgentOrchestrator', () => {
  let orchestrator: AgentOrchestrator;
  let registry: ChannelRegistry;
  const ceoIdentity: CEOIdentity = { telegram: { userId: 123 } };

  beforeEach(() => {
    registry = new ChannelRegistry();
    orchestrator = new AgentOrchestrator({
      registry,
      graph: makeGraph(),
      ceoIdentity,
    });
  });

  it('detects CEO messages on telegram', () => {
    const isCeo = orchestrator.isCeoSender('telegram', '123');
    expect(isCeo).toBe(true);
  });

  it('detects non-CEO messages', () => {
    const isCeo = orchestrator.isCeoSender('telegram', '999');
    expect(isCeo).toBe(false);
  });

  it('finds workspace for a node', () => {
    const ws = orchestrator.findWorkspace('n1');
    expect(ws?.name).toBe('Support');
  });

  it('returns null workspace for unknown node', () => {
    const ws = orchestrator.findWorkspace('unknown');
    expect(ws).toBeNull();
  });
});
```

**Step 2: Implement core orchestrator**

```typescript
// src/orchestrator/orchestrator.ts
import type {
  CanvasGraph, InboundMessage, RoutingAction, CEOIdentity,
  Workspace, AgentNode, Platform,
} from './types.js';
import type { ChannelRegistry } from '../channels/registry.js';
import { evaluateEdgeRules } from './routing.js';

interface OrchestratorDeps {
  readonly registry: ChannelRegistry;
  readonly graph: CanvasGraph;
  readonly ceoIdentity: CEOIdentity;
}

export class AgentOrchestrator {
  private graph: CanvasGraph;
  private readonly registry: ChannelRegistry;
  private readonly ceoIdentity: CEOIdentity;

  constructor(deps: OrchestratorDeps) {
    this.registry = deps.registry;
    this.graph = deps.graph;
    this.ceoIdentity = deps.ceoIdentity;
  }

  updateGraph(graph: CanvasGraph): void {
    this.graph = graph;
  }

  isCeoSender(platform: Platform, senderId: string): boolean {
    if (platform === 'telegram' && this.ceoIdentity.telegram) {
      return String(this.ceoIdentity.telegram.userId) === senderId;
    }
    if (platform === 'slack' && this.ceoIdentity.slack) {
      return this.ceoIdentity.slack.userId === senderId;
    }
    if (platform === 'whatsapp' && this.ceoIdentity.whatsapp) {
      return this.ceoIdentity.whatsapp.phoneNumber === senderId;
    }
    return false;
  }

  findNode(nodeId: string): AgentNode | null {
    return this.graph.nodes.find((n) => n.id === nodeId) ?? null;
  }

  findWorkspace(nodeId: string): Workspace | null {
    const node = this.findNode(nodeId);
    if (!node?.workspaceId) return null;
    return this.graph.workspaces.find((w) => w.id === node.workspaceId) ?? null;
  }

  async handleInbound(message: InboundMessage): Promise<void> {
    const node = this.findNode(message.sourceNodeId);
    if (!node) return;

    const workspace = this.findWorkspace(message.sourceNodeId);

    // Step 1: Evaluate deterministic edge rules
    const ruleActions = evaluateEdgeRules(node, message, [...this.graph.edges]);

    // Step 2: Execute rule-based actions immediately
    for (const action of ruleActions) {
      await this.executeAction(action, message);
    }

    // Step 3: If no rules matched and LLM edges exist, defer to LLM routing
    // (LLM integration added in Phase 4)
    const hasLlmEdges = this.graph.edges.some(
      (e) => e.from === node.id && e.rules.some((r) => r.type === 'llm_decided'),
    );

    if (hasLlmEdges && ruleActions.length === 0) {
      // Placeholder for LLM routing — will be implemented in Task 10
    }
  }

  async executeAction(action: RoutingAction, source: InboundMessage): Promise<void> {
    switch (action.type) {
      case 'forward': {
        const group = this.findGroupForNode(action.targetNodeId);
        await this.registry.sendTo(action.targetNodeId, action.content, group);
        break;
      }
      case 'notify': {
        const group = this.findGroupForNode(action.targetNodeId);
        await this.registry.sendTo(action.targetNodeId, action.summary, group);
        break;
      }
      case 'send_to_all': {
        await this.registry.sendToWorkspace(action.workspaceId, action.content, this.graph);
        break;
      }
      case 'reply': {
        await this.registry.sendTo(source.sourceNodeId, action.content, source.groupId);
        break;
      }
      case 'group_message': {
        await this.registry.sendToWorkspace(action.workspaceId, action.content, this.graph);
        break;
      }
      default:
        break;
    }
  }

  private findGroupForNode(nodeId: string): string | null {
    const node = this.findNode(nodeId);
    if (!node?.workspaceId) return null;
    const workspace = this.graph.workspaces.find((w) => w.id === node.workspaceId);
    if (!workspace) return null;
    const group = workspace.groups.find((g) => g.platform === node.platform);
    return group?.groupId ?? null;
  }
}
```

**Step 3: Run test, verify pass, commit**

```bash
git add src/orchestrator/orchestrator.ts src/orchestrator/__tests__/orchestrator.test.ts
git commit -m "feat: add AgentOrchestrator with edge rule routing and CEO detection"
```

---

## Phase 4: Canvas UI for Workspaces

### Task 9: Canvas graph v2 migration in `desktop/src/main.ts`

**Files:**
- Modify: `desktop/src/main.ts` — update `CanvasGraph` interface and `readCanvasGraph()` to handle v1 → v2 migration

**Step 1: Update interfaces (lines 921-942)**

Replace the existing `CanvasNode`, `CanvasEdge`, `CanvasGraph` interfaces with the v2 versions that include `workspaceId`, `role`, `autonomy`, `instructions`, `groupBehavior` on nodes, `edgeType` and `rules` on edges, and `workspaces` array on the graph.

**Step 2: Update `readCanvasGraph()` (line 944)**

Add migration logic: if parsed graph has no `version` field or `version < 2`, add default values for new fields on all existing nodes/edges and set `workspaces: []`.

**Step 3: Commit**

```bash
git add desktop/src/main.ts
git commit -m "feat: migrate canvas graph to v2 with workspaces and agent roles"
```

---

### Task 10: Workspace frames and agent detail panel in canvas UI

**Files:**
- Modify: `desktop/src/ui/canvas.html` — add workspace rendering, agent detail side panel, workspace creation
- Modify: `desktop/src/ui/canvas.css` — workspace frame styles, agent detail panel styles

**This is the largest UI task. Key additions:**

1. **Workspace frame rendering** — rounded rectangles in `.canvas-world` positioned behind agent cards. Color-coded border, name + purpose header, agent count badge.

2. **Workspace creation** — new button in toolbar "Add Workspace". Opens a small dialog: name, color picker, purpose text field. Creates a workspace frame at viewport center.

3. **Agent snap-to-workspace** — when dragging an agent card and releasing it inside a workspace frame, set `node.workspaceId = workspace.id`. Visual feedback: workspace frame highlights on hover during drag.

4. **Agent detail panel** — click an agent card to open a side panel (right side, similar to add-agent panel):
   - Role selector (dropdown: lead, specialist, observer, bridge, assistant)
   - Autonomy slider (manual → approval → supervised → full)
   - Standing instructions (textarea)
   - Group behavior toggles
   - KPI display (placeholder for now)

5. **Workspace detail panel** — click a workspace frame header to open detail panel:
   - Purpose editor (textarea)
   - Topics list (tag input)
   - Budget config (daily limit number input)
   - Color picker

6. **Edge label on hover** — show edge type and rules summary on hover

**Step 1: Add CSS for workspace frames and detail panel to `canvas.css`**

Key classes:
- `.workspace-frame` — positioned absolute, rounded rect, colored border, semi-transparent fill
- `.workspace-header` — name + agent count at top of frame
- `.workspace-frame.drop-target` — highlight state during drag
- `.agent-detail-panel` — mirrors `.add-agent-panel` layout
- `.workspace-detail-panel` — same pattern

**Step 2: Add HTML structure and inline JS to `canvas.html`**

Add workspace rendering in `renderAll()`, workspace creation dialog, agent detail panel HTML, workspace detail panel HTML, and all event handlers.

**Step 3: Manual test in Electron**

Run: `cd desktop && npx tsc && rm -rf dist/ui && cp -r src/ui dist/ui && npx electron .`
Test: create workspace, drag agent into it, open agent detail, open workspace detail.

**Step 4: Commit**

```bash
git add desktop/src/ui/canvas.html desktop/src/ui/canvas.css
git commit -m "feat: add workspace frames and agent detail panel to canvas UI"
```

---

### Task 11: CEO command bar in canvas

**Files:**
- Modify: `desktop/src/ui/canvas.html`
- Modify: `desktop/src/ui/canvas.css`

**Step 1: Add command bar HTML**

Fixed bottom bar with text input. Placeholder: "Type a command... (@agent, #workspace, or action)". Parses input:
- `@agent_name message` → instruct specific agent
- `#workspace_name message` → broadcast to workspace
- `hire telegram lead in Support` → parsed as hire command
- `pause Sales` → parsed as pause command

**Step 2: Add command bar styles**

`.ceo-command-bar` — fixed bottom-left, transparent background, monospace input, autocomplete dropdown for @agent and #workspace names.

**Step 3: Add IPC handler in `desktop/src/main.ts`**

Add `execute-ceo-command` IPC handler that parses the command string and routes to appropriate action.

**Step 4: Add preload bridge in `desktop/src/preload.ts`**

```typescript
executeCeoCommand: (command: string) => ipcRenderer.invoke('execute-ceo-command', command),
```

**Step 5: Commit**

```bash
git add desktop/src/ui/canvas.html desktop/src/ui/canvas.css desktop/src/main.ts desktop/src/preload.ts
git commit -m "feat: add CEO command bar to canvas with @agent and #workspace routing"
```

---

## Phase 5: Daemon Integration

### Task 12: Refactor daemon-lifecycle for multi-channel orchestrator

**Files:**
- Modify: `src/daemon-lifecycle.ts`

**Step 1: Replace single `telegram` field with `ChannelRegistry`**

The `DaemonContext` interface changes:
```typescript
export interface DaemonContext {
  readonly db: BetterSqlite3.Database;
  readonly config: OpenWindConfig;
  readonly audit: AuditLogger;
  readonly router: ModelRouter;
  readonly mcpClients: McpClientManager;
  readonly engine: ProactiveEngine;
  readonly orchestrator: AgentOrchestrator;  // NEW
  readonly registry: ChannelRegistry;        // NEW (replaces telegram)
  readonly mcpServer: McpServer;
  readonly refreshInterval: ReturnType<typeof setInterval>;
}
```

**Step 2: Load canvas graph and create orchestrator**

In `startDaemonContext()`:
1. Read `~/.openwind/canvas.json` → parse as `CanvasGraph`
2. Read `config.ceo` → build `CEOIdentity`
3. Create `ChannelRegistry`
4. Create `AgentOrchestrator` with registry + graph + ceoIdentity
5. For each connected node in graph, create the appropriate channel and register it
6. Update `handleAlert` to broadcast via orchestrator instead of single telegram

**Step 3: Update `stopDaemonContext()`**

Replace `telegram.stop()` with `registry.stopAll()`.

**Step 4: Commit**

```bash
git add src/daemon-lifecycle.ts
git commit -m "refactor: replace single telegram channel with multi-channel orchestrator"
```

---

### Task 13: Add `sendMessage` and `sendToGroup` to TelegramChannel

**Files:**
- Modify: `src/channels/telegram.ts`

**Step 1: Implement `sendMessage()`**

```typescript
async sendMessage(content: string, groupId: string | null): Promise<void> {
  if (groupId) {
    await this.bot.api.sendMessage(Number(groupId), content);
  } else {
    for (const userId of this.allowedUsers) {
      await this.bot.api.sendMessage(userId, content);
    }
  }
}

async sendToGroup(groupId: string, content: string): Promise<void> {
  await this.bot.api.sendMessage(Number(groupId), content);
}
```

**Step 2: Wire inbound messages to orchestrator**

Add optional `onInbound` callback to `TelegramDeps`. In `handleTextMessage` and `handleVoice`, after processing, call `onInbound` with an `InboundMessage` so the orchestrator can route it.

**Step 3: Commit**

```bash
git add src/channels/telegram.ts
git commit -m "feat: add sendMessage/sendToGroup to TelegramChannel and wire to orchestrator"
```

---

## Phase 6: Worker Thread Isolation (Future)

### Task 14: Worker thread per workspace

**Files:**
- Create: `src/orchestrator/workspace-worker.ts`
- Create: `src/orchestrator/worker-pool.ts`

> **Note:** This task uses `node:worker_threads`. Each workspace runs in its own worker thread with its own message queue, channel connections, and rate limiters. The main thread orchestrator dispatches messages to the appropriate worker via `MessageChannel`.

This is a substantial refactor. Defer to after Phase 5 is stable and tested end-to-end.

**Placeholder commit:**

```bash
git commit --allow-empty -m "chore: placeholder for workspace worker thread isolation (phase 6)"
```

---

## Verification Checklist

After all phases:

1. `npx vitest run` — all tests pass
2. `npx tsc --noEmit` — no type errors
3. `cd desktop && npx tsc` — desktop compiles
4. Manual test: open canvas, create workspace, add agent to workspace, set role/autonomy
5. Manual test: draw edge between agents, verify rule config UI
6. Manual test: CEO command bar parses `@agent` and `#workspace` commands
7. Manual test: connect Telegram bot, send message, verify routing through orchestrator
8. Manual test: verify canvas state persists after close/reopen
