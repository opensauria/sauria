import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { writeFileSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';
import { applySchema } from '../../db/schema.js';
import { AgentOrchestrator } from '../orchestrator.js';
import { AgentMemory } from '../agent-memory.js';
import { EscalationManager } from '../escalation.js';
import { CheckpointManager } from '../checkpoint.js';
import { KPITracker } from '../kpi-tracker.js';
import { DelegationTracker } from '../delegation-tracker.js';
import type { CanvasGraph, InboundMessage, AgentNode } from '../types.js';
import { DEFAULT_GROUP_BEHAVIOR, createEmptyGraph } from '../types.js';
import { ChannelRegistry } from '../../channels/registry.js';

// ─── Shared Fixtures ──────────────────────────────────────────────

function makeWorkspace(
  overrides: Partial<CanvasGraph['workspaces'][0]> = {},
): CanvasGraph['workspaces'][0] {
  return {
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
    ...overrides,
  };
}

function makeNode(overrides: Partial<AgentNode> = {}): AgentNode {
  return {
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
    ...overrides,
  };
}

function makeGraph(
  nodes: AgentNode[] = [makeNode()],
  workspaces: CanvasGraph['workspaces'] = [makeWorkspace()],
): CanvasGraph {
  return { ...createEmptyGraph(), nodes, workspaces };
}

// ─── Tests ────────────────────────────────────────────────────────

describe('AgentOrchestrator', () => {
  let orchestrator: AgentOrchestrator;
  let registry: ChannelRegistry;

  beforeEach(() => {
    registry = new ChannelRegistry();
    orchestrator = new AgentOrchestrator({
      registry,
      graph: makeGraph(),
      ownerIdentity: { telegram: { userId: 123 } },
    });
  });

  it('detects owner messages on telegram', () => {
    expect(orchestrator.isOwnerSender('telegram', '123')).toBe(true);
  });

  it('detects non-owner messages', () => {
    expect(orchestrator.isOwnerSender('telegram', '999')).toBe(false);
  });

  it('finds workspace for a node', () => {
    expect(orchestrator.findWorkspace('n1')?.name).toBe('Support');
  });

  it('returns null workspace for unknown node', () => {
    expect(orchestrator.findWorkspace('unknown')).toBeNull();
  });
});

describe('executeAction forward enrichment', () => {
  let db: Database.Database;
  let registry: ChannelRegistry;
  let orchestrator: AgentOrchestrator;

  const graph = makeGraph([
    makeNode(),
    makeNode({ id: 'n2', platform: 'slack', label: '@design_bot', role: 'specialist' }),
  ]);

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

  it('enriches forward content with recent conversation context', async () => {
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
    const sentContent = sendTo.mock.calls[0]![1] as string;

    expect(sentContent).toContain('[Forwarded from @support_bot]');
    expect(sentContent).toContain('Schedule a meeting with design');
    expect(sentContent).toContain('Please handle design meeting');
  });
});

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

describe('handleOwnerCommand graph persistence', () => {
  let tmpDir: string;
  let canvasPath: string;
  let registry: ChannelRegistry;
  let orchestrator: AgentOrchestrator;

  const graphWithTwoNodes = makeGraph(
    [
      makeNode(),
      makeNode({ id: 'n2', platform: 'slack', label: '@design_bot', role: 'specialist' }),
    ],
    [
      makeWorkspace(),
      makeWorkspace({
        id: 'ws2',
        name: 'Design',
        color: '#00ff00',
        purpose: 'Handle design',
        topics: ['design'],
      }),
    ],
  );

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'opensauria-test-'));
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

    const saved = JSON.parse(readFileSync(canvasPath, 'utf-8')) as CanvasGraph;
    const node = saved.nodes.find((n) => n.id === 'n1');
    expect(node?.autonomy).toBe('full');
  });

  it('persists graph to canvas.json after reassign', async () => {
    await orchestrator.handleOwnerCommand({
      type: 'reassign',
      agentId: 'n1',
      newWorkspaceId: 'ws2',
    });

    const saved = JSON.parse(readFileSync(canvasPath, 'utf-8')) as CanvasGraph;
    const node = saved.nodes.find((n) => n.id === 'n1');
    expect(node?.workspaceId).toBe('ws2');
  });

  it('persists graph to canvas.json after fire', async () => {
    await orchestrator.handleOwnerCommand({
      type: 'fire',
      agentId: 'n2',
    });

    const saved = JSON.parse(readFileSync(canvasPath, 'utf-8')) as CanvasGraph;
    expect(saved.nodes).toHaveLength(1);
    expect(saved.nodes[0]?.id).toBe('n1');
  });
});

describe('internal routing', () => {
  let db: Database.Database;
  let registry: ChannelRegistry;

  const twoNodeGraph = (): CanvasGraph =>
    makeGraph([
      makeNode(),
      makeNode({ id: 'n2', platform: 'slack', label: '@design_bot', role: 'specialist' }),
    ]);

  beforeEach(() => {
    db = new Database(':memory:');
    applySchema(db);
    registry = new ChannelRegistry();
    registry.sendTo = vi.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    db.close();
  });

  it('routes forward internally when enqueueInternal is provided', async () => {
    const enqueued: InboundMessage[] = [];
    const orchestrator = new AgentOrchestrator({
      registry,
      graph: twoNodeGraph(),
      ownerIdentity: { telegram: { userId: 123 } },
      agentMemory: new AgentMemory(db),
      enqueueInternal: (msg) => enqueued.push(msg),
    });

    const source: InboundMessage = {
      sourceNodeId: 'n1',
      platform: 'telegram',
      senderId: '123',
      senderIsOwner: true,
      groupId: null,
      content: 'Forward this',
      contentType: 'text',
      timestamp: new Date().toISOString(),
    };

    await orchestrator.executeAction(
      { type: 'forward', targetNodeId: 'n2', content: 'Forwarded message' },
      source,
    );

    expect(enqueued).toHaveLength(1);
    expect(enqueued[0]!.sourceNodeId).toBe('n2');
    expect(enqueued[0]!.platform).toBe('internal');
    expect(enqueued[0]!.internalRoute).toBeDefined();
    expect(enqueued[0]!.internalRoute!.fromNodeId).toBe('n1');
    expect(enqueued[0]!.internalRoute!.hopCount).toBe(0);
    // External sendTo should NOT be called
    expect(registry.sendTo).not.toHaveBeenCalled();
  });

  it('falls back to registry.sendTo when enqueueInternal is not provided', async () => {
    const orchestrator = new AgentOrchestrator({
      registry,
      graph: twoNodeGraph(),
      ownerIdentity: { telegram: { userId: 123 } },
      agentMemory: new AgentMemory(db),
    });

    const source: InboundMessage = {
      sourceNodeId: 'n1',
      platform: 'telegram',
      senderId: '123',
      senderIsOwner: true,
      groupId: null,
      content: 'Forward this',
      contentType: 'text',
      timestamp: new Date().toISOString(),
    };

    await orchestrator.executeAction(
      { type: 'forward', targetNodeId: 'n2', content: 'Forwarded message' },
      source,
    );

    expect(registry.sendTo).toHaveBeenCalled();
  });

  it('falls back to registry.sendTo when target node is disconnected', async () => {
    const graph = makeGraph([
      makeNode(),
      makeNode({
        id: 'n2',
        platform: 'slack',
        label: '@design_bot',
        status: 'disconnected',
      }),
    ]);
    const orchestrator = new AgentOrchestrator({
      registry,
      graph,
      ownerIdentity: { telegram: { userId: 123 } },
      agentMemory: new AgentMemory(db),
      enqueueInternal: vi.fn(),
    });

    const source: InboundMessage = {
      sourceNodeId: 'n1',
      platform: 'telegram',
      senderId: '123',
      senderIsOwner: true,
      groupId: null,
      content: 'Forward this',
      contentType: 'text',
      timestamp: new Date().toISOString(),
    };

    await orchestrator.executeAction(
      { type: 'forward', targetNodeId: 'n2', content: 'Forwarded message' },
      source,
    );

    expect(registry.sendTo).toHaveBeenCalled();
  });

  it('increments hopCount on subsequent internal forwards', async () => {
    const enqueued: InboundMessage[] = [];
    const orchestrator = new AgentOrchestrator({
      registry,
      graph: twoNodeGraph(),
      ownerIdentity: { telegram: { userId: 123 } },
      agentMemory: new AgentMemory(db),
      enqueueInternal: (msg) => enqueued.push(msg),
    });

    const source: InboundMessage = {
      sourceNodeId: 'n1',
      platform: 'internal',
      senderId: 'n0',
      senderIsOwner: false,
      groupId: 'dialogue-1',
      content: 'Continue conversation',
      contentType: 'text',
      timestamp: new Date().toISOString(),
      internalRoute: {
        originNodeId: 'n0',
        fromNodeId: 'n0',
        hopCount: 2,
        dialogueId: 'dialogue-1',
      },
    };

    await orchestrator.executeAction(
      { type: 'forward', targetNodeId: 'n2', content: 'Hop 3' },
      source,
    );

    expect(enqueued[0]!.internalRoute!.hopCount).toBe(3);
    expect(enqueued[0]!.internalRoute!.dialogueId).toBe('dialogue-1');
    expect(enqueued[0]!.internalRoute!.originNodeId).toBe('n0');
  });

  it('routes notify internally', async () => {
    const enqueued: InboundMessage[] = [];
    const orchestrator = new AgentOrchestrator({
      registry,
      graph: twoNodeGraph(),
      ownerIdentity: { telegram: { userId: 123 } },
      agentMemory: new AgentMemory(db),
      enqueueInternal: (msg) => enqueued.push(msg),
    });

    const source: InboundMessage = {
      sourceNodeId: 'n1',
      platform: 'telegram',
      senderId: '123',
      senderIsOwner: true,
      groupId: null,
      content: 'Notify design',
      contentType: 'text',
      timestamp: new Date().toISOString(),
    };

    await orchestrator.executeAction(
      { type: 'notify', targetNodeId: 'n2', summary: 'Heads up' },
      source,
    );

    expect(enqueued).toHaveLength(1);
    expect(registry.sendTo).not.toHaveBeenCalled();
  });

  it('routes assign internally', async () => {
    const enqueued: InboundMessage[] = [];
    const orchestrator = new AgentOrchestrator({
      registry,
      graph: twoNodeGraph(),
      ownerIdentity: { telegram: { userId: 123 } },
      db,
      agentMemory: new AgentMemory(db),
      enqueueInternal: (msg) => enqueued.push(msg),
    });

    const source: InboundMessage = {
      sourceNodeId: 'n1',
      platform: 'telegram',
      senderId: '123',
      senderIsOwner: true,
      groupId: null,
      content: 'Assign task',
      contentType: 'text',
      timestamp: new Date().toISOString(),
    };

    await orchestrator.executeAction(
      { type: 'assign', targetNodeId: 'n2', task: 'Review PR', priority: 'high' },
      source,
    );

    expect(enqueued).toHaveLength(1);
    expect(enqueued[0]!.content).toContain('[Task] Review PR');
    expect(registry.sendTo).not.toHaveBeenCalled();
  });
});

describe('hop limit enforcement', () => {
  let db: Database.Database;
  let registry: ChannelRegistry;

  beforeEach(() => {
    db = new Database(':memory:');
    applySchema(db);
    registry = new ChannelRegistry();
    registry.sendTo = vi.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    db.close();
  });

  it('drops message when hop limit is reached', async () => {
    const orchestrator = new AgentOrchestrator({
      registry,
      graph: makeGraph(),
      ownerIdentity: { telegram: { userId: 123 } },
      agentMemory: new AgentMemory(db),
    });

    const message: InboundMessage = {
      sourceNodeId: 'n1',
      platform: 'internal',
      senderId: 'n0',
      senderIsOwner: false,
      groupId: 'dialogue-1',
      content: 'Loop detected',
      contentType: 'text',
      timestamp: new Date().toISOString(),
      internalRoute: {
        originNodeId: 'n0',
        fromNodeId: 'n0',
        hopCount: 5,
        dialogueId: 'dialogue-1',
      },
    };

    await orchestrator.handleInbound(message);

    // Should silently drop — no sendTo calls
    expect(registry.sendTo).not.toHaveBeenCalled();
  });

  it('processes message when under hop limit', async () => {
    const orchestrator = new AgentOrchestrator({
      registry,
      graph: makeGraph(),
      ownerIdentity: { telegram: { userId: 123 } },
      agentMemory: new AgentMemory(db),
    });

    const message: InboundMessage = {
      sourceNodeId: 'n1',
      platform: 'internal',
      senderId: 'n0',
      senderIsOwner: false,
      groupId: 'dialogue-1',
      content: 'Still ok',
      contentType: 'text',
      timestamp: new Date().toISOString(),
      internalRoute: {
        originNodeId: 'n0',
        fromNodeId: 'n0',
        hopCount: 4,
        dialogueId: 'dialogue-1',
      },
    };

    // Should not throw — processes normally (no rules, no brain → no actions)
    await orchestrator.handleInbound(message);
  });
});

describe('escalation execution', () => {
  let db: Database.Database;
  let registry: ChannelRegistry;

  beforeEach(() => {
    db = new Database(':memory:');
    applySchema(db);
    registry = new ChannelRegistry();
    registry.sendTo = vi.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    db.close();
  });

  it('creates escalation record and notifies owner channel', async () => {
    const escalationManager = new EscalationManager(db);
    const graph = makeGraph([
      makeNode({ id: 'agent1', platform: 'telegram', label: '@helper' }),
      makeNode({ id: 'owner-ch', platform: 'telegram', label: '@owner-telegram' }),
    ]);

    const orchestrator = new AgentOrchestrator({
      registry,
      graph,
      ownerIdentity: { telegram: { userId: 123 } },
      agentMemory: new AgentMemory(db),
      escalationManager,
    });

    const source: InboundMessage = {
      sourceNodeId: 'agent1',
      platform: 'telegram',
      senderId: 'user1',
      senderIsOwner: false,
      groupId: null,
      content: 'Complex problem',
      contentType: 'text',
      timestamp: new Date().toISOString(),
    };

    await orchestrator.executeAction(
      { type: 'escalate', summary: 'Cannot handle billing dispute' },
      source,
    );

    // Escalation record created
    expect(escalationManager.getPendingCount()).toBe(1);
    const pending = escalationManager.findMostRecentPending();
    expect(pending!.summary).toBe('Cannot handle billing dispute');
    expect(pending!.sourceNodeId).toBe('agent1');

    // Owner notified
    const sendTo = registry.sendTo as ReturnType<typeof vi.fn>;
    expect(sendTo).toHaveBeenCalled();
    const sentContent = sendTo.mock.calls[0]![1] as string;
    expect(sentContent).toContain('[Escalation from @helper]');
    expect(sentContent).toContain('Cannot handle billing dispute');
  });

  it('escalation without escalationManager still notifies owner', async () => {
    const graph = makeGraph([makeNode({ id: 'agent1', platform: 'telegram', label: '@helper' })]);

    const orchestrator = new AgentOrchestrator({
      registry,
      graph,
      ownerIdentity: { telegram: { userId: 123 } },
      agentMemory: new AgentMemory(db),
    });

    const source: InboundMessage = {
      sourceNodeId: 'agent1',
      platform: 'telegram',
      senderId: 'user1',
      senderIsOwner: false,
      groupId: null,
      content: 'Help',
      contentType: 'text',
      timestamp: new Date().toISOString(),
    };

    await orchestrator.executeAction({ type: 'escalate', summary: 'Need guidance' }, source);

    const sendTo = registry.sendTo as ReturnType<typeof vi.fn>;
    expect(sendTo).toHaveBeenCalled();
    const sentContent = sendTo.mock.calls[0]![1] as string;
    expect(sentContent).toContain('[Escalation from @helper]');
  });
});

describe('owner reply routes back to escalating agent', () => {
  let db: Database.Database;
  let registry: ChannelRegistry;

  beforeEach(() => {
    db = new Database(':memory:');
    applySchema(db);
    registry = new ChannelRegistry();
    registry.sendTo = vi.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    db.close();
  });

  it('resolves escalation and routes owner reply to the agent', async () => {
    const escalationManager = new EscalationManager(db);
    const graph = makeGraph([
      makeNode({ id: 'agent1', platform: 'telegram', label: '@helper' }),
      makeNode({ id: 'owner-ch', platform: 'telegram', label: '@owner-telegram' }),
    ]);

    const orchestrator = new AgentOrchestrator({
      registry,
      graph,
      ownerIdentity: { telegram: { userId: 123 } },
      agentMemory: new AgentMemory(db),
      escalationManager,
    });

    // Create a pending escalation
    escalationManager.create('agent1', 'conv-123', 'Billing issue');

    // Owner replies
    const ownerReply: InboundMessage = {
      sourceNodeId: 'owner-ch',
      platform: 'telegram',
      senderId: '123',
      senderIsOwner: true,
      groupId: null,
      content: 'Approve the refund',
      contentType: 'text',
      timestamp: new Date().toISOString(),
    };

    await orchestrator.handleInbound(ownerReply);

    // Escalation resolved
    expect(escalationManager.getPendingCount()).toBe(0);

    // Reply routed to agent (via registry since no enqueueInternal)
    const sendTo = registry.sendTo as ReturnType<typeof vi.fn>;
    expect(sendTo).toHaveBeenCalled();
    const targetNodeId = sendTo.mock.calls[0]![0] as string;
    const sentContent = sendTo.mock.calls[0]![1] as string;
    expect(targetNodeId).toBe('agent1');
    expect(sentContent).toBe('Approve the refund');
  });

  it('routes owner reply internally when enqueueInternal is available', async () => {
    const escalationManager = new EscalationManager(db);
    const enqueued: InboundMessage[] = [];
    const graph = makeGraph([
      makeNode({ id: 'agent1', platform: 'telegram', label: '@helper' }),
      makeNode({ id: 'owner-ch', platform: 'telegram', label: '@owner-telegram' }),
    ]);

    const orchestrator = new AgentOrchestrator({
      registry,
      graph,
      ownerIdentity: { telegram: { userId: 123 } },
      agentMemory: new AgentMemory(db),
      escalationManager,
      enqueueInternal: (msg) => enqueued.push(msg),
    });

    escalationManager.create('agent1', 'conv-123', 'Billing issue');

    const ownerReply: InboundMessage = {
      sourceNodeId: 'owner-ch',
      platform: 'telegram',
      senderId: '123',
      senderIsOwner: true,
      groupId: null,
      content: 'Handle it this way',
      contentType: 'text',
      timestamp: new Date().toISOString(),
    };

    await orchestrator.handleInbound(ownerReply);

    // Routed internally
    expect(enqueued).toHaveLength(1);
    expect(enqueued[0]!.sourceNodeId).toBe('agent1');
    expect(enqueued[0]!.content).toBe('Handle it this way');
    // External sendTo NOT called
    expect(registry.sendTo).not.toHaveBeenCalled();
  });

  it('normal owner message passes through when no pending escalation', async () => {
    const escalationManager = new EscalationManager(db);
    const graph = makeGraph([makeNode({ id: 'n1', platform: 'telegram', label: '@bot' })]);

    const orchestrator = new AgentOrchestrator({
      registry,
      graph,
      ownerIdentity: { telegram: { userId: 123 } },
      agentMemory: new AgentMemory(db),
      escalationManager,
    });

    const ownerMessage: InboundMessage = {
      sourceNodeId: 'n1',
      platform: 'telegram',
      senderId: '123',
      senderIsOwner: true,
      groupId: null,
      content: 'Regular message',
      contentType: 'text',
      timestamp: new Date().toISOString(),
    };

    // Should not throw — continues normal flow
    await orchestrator.handleInbound(ownerMessage);
  });

  it('routes owner reply to correct agent when multiple escalations pending', async () => {
    const escalationManager = new EscalationManager(db);
    const graph = makeGraph([
      makeNode({ id: 'agent1', platform: 'telegram', label: '@agent1' }),
      makeNode({ id: 'agent2', platform: 'slack', label: '@agent2' }),
      makeNode({ id: 'owner-ch', platform: 'telegram', label: '@owner-ch' }),
    ]);

    const orchestrator = new AgentOrchestrator({
      registry,
      graph,
      ownerIdentity: { telegram: { userId: 123 } },
      agentMemory: new AgentMemory(db),
      escalationManager,
    });

    // Both agents escalate
    escalationManager.create('agent1', 'conv-a', 'Billing issue');
    escalationManager.create('agent2', 'conv-b', 'Shipping issue');

    // Owner replies on agent1's channel
    const ownerReply: InboundMessage = {
      sourceNodeId: 'agent1',
      platform: 'telegram',
      senderId: '123',
      senderIsOwner: true,
      groupId: null,
      content: 'Approve refund',
      contentType: 'text',
      timestamp: new Date().toISOString(),
    };

    await orchestrator.handleInbound(ownerReply);

    const sendTo = registry.sendTo as ReturnType<typeof vi.fn>;
    expect(sendTo).toHaveBeenCalled();
    const targetNodeId = sendTo.mock.calls[0]![0] as string;
    expect(targetNodeId).toBe('agent1');

    // agent2's escalation still pending
    expect(escalationManager.getPendingCount()).toBe(1);
    expect(escalationManager.findPendingForChannel('agent2')).not.toBeNull();
  });
});

describe('internal conversation tracking', () => {
  let db: Database.Database;
  let registry: ChannelRegistry;

  beforeEach(() => {
    db = new Database(':memory:');
    applySchema(db);
    registry = new ChannelRegistry();
    registry.sendTo = vi.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    db.close();
  });

  it('records internal messages with internal platform and dialogueId', async () => {
    const agentMemory = new AgentMemory(db);
    const orchestrator = new AgentOrchestrator({
      registry,
      graph: makeGraph(),
      ownerIdentity: { telegram: { userId: 123 } },
      agentMemory,
    });

    const message: InboundMessage = {
      sourceNodeId: 'n1',
      platform: 'internal',
      senderId: 'n0',
      senderIsOwner: false,
      groupId: 'dialogue-abc',
      content: 'Internal message',
      contentType: 'text',
      timestamp: new Date().toISOString(),
      internalRoute: {
        originNodeId: 'n0',
        fromNodeId: 'n0',
        hopCount: 1,
        dialogueId: 'dialogue-abc',
      },
    };

    await orchestrator.handleInbound(message);

    // Check conversation was created with internal platform
    const conversations = db.prepare('SELECT * FROM agent_conversations').all() as Array<
      Record<string, unknown>
    >;
    expect(conversations.length).toBeGreaterThan(0);
    const conv = conversations[0]!;
    expect(conv['platform']).toBe('internal');
  });
});

describe('executeAction — send_to_all and group_message', () => {
  let registry: ChannelRegistry;

  beforeEach(() => {
    registry = new ChannelRegistry();
    registry.sendToWorkspace = vi.fn().mockResolvedValue(undefined);
  });

  it('send_to_all calls registry.sendToWorkspace', async () => {
    const graph = makeGraph();
    const orchestrator = new AgentOrchestrator({
      registry,
      graph,
      ownerIdentity: { telegram: { userId: 123 } },
    });

    const source: InboundMessage = {
      sourceNodeId: 'n1',
      platform: 'telegram',
      senderId: '123',
      senderIsOwner: true,
      groupId: null,
      content: 'Broadcast',
      contentType: 'text',
      timestamp: new Date().toISOString(),
    };

    await orchestrator.executeAction(
      { type: 'send_to_all', workspaceId: 'ws1', content: 'Announcement' },
      source,
    );

    expect(registry.sendToWorkspace).toHaveBeenCalledWith('ws1', 'Announcement', graph);
  });

  it('group_message calls registry.sendToWorkspace', async () => {
    const graph = makeGraph();
    const orchestrator = new AgentOrchestrator({
      registry,
      graph,
      ownerIdentity: { telegram: { userId: 123 } },
    });

    const source: InboundMessage = {
      sourceNodeId: 'n1',
      platform: 'telegram',
      senderId: '123',
      senderIsOwner: true,
      groupId: null,
      content: 'Team update',
      contentType: 'text',
      timestamp: new Date().toISOString(),
    };

    await orchestrator.executeAction(
      { type: 'group_message', workspaceId: 'ws1', content: 'Team sync' },
      source,
    );

    expect(registry.sendToWorkspace).toHaveBeenCalledWith('ws1', 'Team sync', graph);
  });
});

describe('executeAction — learn', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    applySchema(db);
  });

  afterEach(() => {
    db.close();
  });

  it('stores fact in agent memory', async () => {
    const agentMemory = new AgentMemory(db);
    const registry = new ChannelRegistry();
    const orchestrator = new AgentOrchestrator({
      registry,
      graph: makeGraph(),
      ownerIdentity: { telegram: { userId: 123 } },
      agentMemory,
    });

    const source: InboundMessage = {
      sourceNodeId: 'n1',
      platform: 'telegram',
      senderId: '123',
      senderIsOwner: true,
      groupId: null,
      content: 'Learn this',
      contentType: 'text',
      timestamp: new Date().toISOString(),
    };

    await orchestrator.executeAction(
      { type: 'learn', fact: 'Customer prefers email', topics: ['preferences'] },
      source,
    );

    const facts = agentMemory.getAgentFacts('n1', 5);
    expect(facts).toContain('Customer prefers email');
  });
});

describe('executeAction — checkpoint', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    applySchema(db);
  });

  afterEach(() => {
    db.close();
  });

  it('queues checkpoint for approval', async () => {
    const checkpointManager = new CheckpointManager(db);
    const registry = new ChannelRegistry();
    const orchestrator = new AgentOrchestrator({
      registry,
      graph: makeGraph(),
      ownerIdentity: { telegram: { userId: 123 } },
      checkpointManager,
    });

    const source: InboundMessage = {
      sourceNodeId: 'n1',
      platform: 'telegram',
      senderId: '123',
      senderIsOwner: true,
      groupId: null,
      content: 'Check point',
      contentType: 'text',
      timestamp: new Date().toISOString(),
    };

    await orchestrator.executeAction(
      {
        type: 'checkpoint',
        description: 'Ready to deploy',
        pendingActions: [{ type: 'reply', content: 'Deployed' }],
      },
      source,
    );

    const pending = checkpointManager.getPending();
    expect(pending).toHaveLength(1);
    expect(pending[0]!.description).toBe('Ready to deploy');
  });
});

describe('executeApprovedActions', () => {
  let registry: ChannelRegistry;

  beforeEach(() => {
    registry = new ChannelRegistry();
    registry.sendTo = vi.fn().mockResolvedValue(undefined);
  });

  it('executes approved actions and returns count', async () => {
    const orchestrator = new AgentOrchestrator({
      registry,
      graph: makeGraph(),
      ownerIdentity: { telegram: { userId: 123 } },
    });

    const count = await orchestrator.executeApprovedActions('n1', [
      { type: 'reply', content: 'Action 1' },
      { type: 'reply', content: 'Action 2' },
    ]);

    expect(count).toBe(2);
    expect(registry.sendTo).toHaveBeenCalledTimes(2);
  });

  it('continues executing after individual action failure', async () => {
    registry.sendTo = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce(undefined);

    const orchestrator = new AgentOrchestrator({
      registry,
      graph: makeGraph(),
      ownerIdentity: { telegram: { userId: 123 } },
    });

    const count = await orchestrator.executeApprovedActions('n1', [
      { type: 'reply', content: 'Fails' },
      { type: 'reply', content: 'Succeeds' },
    ]);

    expect(count).toBe(1);
  });
});

describe('handleOwnerCommand — broadcast', () => {
  let registry: ChannelRegistry;

  beforeEach(() => {
    registry = new ChannelRegistry();
    registry.sendToWorkspace = vi.fn().mockResolvedValue(undefined);
  });

  it('broadcasts to all workspaces', async () => {
    const graph = makeGraph(
      [makeNode()],
      [
        makeWorkspace(),
        makeWorkspace({ id: 'ws2', name: 'Design', purpose: 'Design work', topics: ['design'] }),
      ],
    );
    const orchestrator = new AgentOrchestrator({
      registry,
      graph,
      ownerIdentity: { telegram: { userId: 123 } },
    });

    await orchestrator.handleOwnerCommand({
      type: 'broadcast',
      message: 'Company announcement',
    });

    expect(registry.sendToWorkspace).toHaveBeenCalledTimes(2);
  });
});

describe('handleOwnerCommand — review', () => {
  let db: Database.Database;
  let registry: ChannelRegistry;

  beforeEach(() => {
    db = new Database(':memory:');
    applySchema(db);
    registry = new ChannelRegistry();
    registry.sendTo = vi.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    db.close();
  });

  it('sends review summary to owner channel', async () => {
    const graph = makeGraph([makeNode({ id: 'n1', platform: 'telegram', label: '@bot' })]);
    const orchestrator = new AgentOrchestrator({
      registry,
      graph,
      ownerIdentity: { telegram: { userId: 123 } },
      kpiTracker: new KPITracker(db),
    });

    await orchestrator.handleOwnerCommand({ type: 'review', agentId: 'n1' });

    const sendTo = registry.sendTo as ReturnType<typeof vi.fn>;
    expect(sendTo).toHaveBeenCalled();
    const sentContent = sendTo.mock.calls[0]![1] as string;
    expect(sentContent).toContain('[Review]');
    expect(sentContent).toContain('@bot');
    expect(sentContent).toContain('Messages:');
  });

  it('review without kpiTracker still works', async () => {
    const graph = makeGraph([makeNode({ id: 'n1', platform: 'telegram', label: '@bot' })]);
    const orchestrator = new AgentOrchestrator({
      registry,
      graph,
      ownerIdentity: { telegram: { userId: 123 } },
    });

    await orchestrator.handleOwnerCommand({ type: 'review', agentId: 'n1' });

    const sendTo = registry.sendTo as ReturnType<typeof vi.fn>;
    expect(sendTo).toHaveBeenCalled();
    const sentContent = sendTo.mock.calls[0]![1] as string;
    expect(sentContent).toContain('[Review]');
    expect(sentContent).not.toContain('Messages:');
  });
});

describe('handleOwnerCommand — hire', () => {
  it('logs hire placeholder without error', async () => {
    const registry = new ChannelRegistry();
    const orchestrator = new AgentOrchestrator({
      registry,
      graph: makeGraph(),
      ownerIdentity: { telegram: { userId: 123 } },
    });

    // Should not throw
    await orchestrator.handleOwnerCommand({
      type: 'hire',
      platform: 'telegram',
      workspace: 'ws1',
      role: 'specialist',
    });
  });
});

describe('handleOwnerCommand — pause', () => {
  let registry: ChannelRegistry;

  beforeEach(() => {
    registry = new ChannelRegistry();
    registry.stop = vi.fn().mockResolvedValue(undefined);
  });

  it('pauses all nodes in the workspace', async () => {
    const graph = makeGraph(
      [
        makeNode({ id: 'n1', workspaceId: 'ws1' }),
        makeNode({ id: 'n2', platform: 'slack', label: '@slack-bot', workspaceId: 'ws1' }),
        makeNode({ id: 'n3', platform: 'discord', label: '@discord-bot', workspaceId: 'ws2' }),
      ],
      [
        makeWorkspace({ id: 'ws1' }),
        makeWorkspace({ id: 'ws2', name: 'Other', purpose: 'Other', topics: [] }),
      ],
    );
    const orchestrator = new AgentOrchestrator({
      registry,
      graph,
      ownerIdentity: { telegram: { userId: 123 } },
    });

    await orchestrator.handleOwnerCommand({ type: 'pause', workspaceId: 'ws1' });

    expect(registry.stop).toHaveBeenCalledTimes(2);
    // n3 should remain connected
    expect(orchestrator.findNode('n3')?.status).toBe('connected');
  });

  it('returns early when workspace not found', async () => {
    const orchestrator = new AgentOrchestrator({
      registry,
      graph: makeGraph(),
      ownerIdentity: { telegram: { userId: 123 } },
    });

    // Should not throw
    await orchestrator.handleOwnerCommand({ type: 'pause', workspaceId: 'nonexistent' });
    expect(registry.stop).not.toHaveBeenCalled();
  });
});

describe('handleOwnerCommand — agent not found cases', () => {
  it('instruct returns early for unknown agent', async () => {
    const registry = new ChannelRegistry();
    registry.sendTo = vi.fn();
    const orchestrator = new AgentOrchestrator({
      registry,
      graph: makeGraph(),
      ownerIdentity: { telegram: { userId: 123 } },
    });

    await orchestrator.handleOwnerCommand({
      type: 'instruct',
      agentId: 'nonexistent',
      instruction: 'Do something',
    });

    expect(registry.sendTo).not.toHaveBeenCalled();
  });

  it('reassign returns early for unknown workspace', async () => {
    const registry = new ChannelRegistry();
    const orchestrator = new AgentOrchestrator({
      registry,
      graph: makeGraph(),
      ownerIdentity: { telegram: { userId: 123 } },
    });

    await orchestrator.handleOwnerCommand({
      type: 'reassign',
      agentId: 'n1',
      newWorkspaceId: 'nonexistent',
    });
  });
});

describe('handleOwnerCommand — instruct', () => {
  it('sends instruction to the target agent', async () => {
    const registry = new ChannelRegistry();
    registry.sendTo = vi.fn().mockResolvedValue(undefined);
    const orchestrator = new AgentOrchestrator({
      registry,
      graph: makeGraph(),
      ownerIdentity: { telegram: { userId: 123 } },
    });

    await orchestrator.handleOwnerCommand({
      type: 'instruct',
      agentId: 'n1',
      instruction: 'Focus on billing tickets',
    });

    const sendTo = registry.sendTo as ReturnType<typeof vi.fn>;
    expect(sendTo).toHaveBeenCalledOnce();
    expect(sendTo.mock.calls[0]![1]).toBe('Focus on billing tickets');
  });
});

describe('isOwnerSender — multiple platforms', () => {
  it('detects slack owner', () => {
    const registry = new ChannelRegistry();
    const orchestrator = new AgentOrchestrator({
      registry,
      graph: makeGraph(),
      ownerIdentity: { slack: { userId: 'U123' } },
    });

    expect(orchestrator.isOwnerSender('slack', 'U123')).toBe(true);
    expect(orchestrator.isOwnerSender('slack', 'U999')).toBe(false);
  });

  it('detects whatsapp owner', () => {
    const registry = new ChannelRegistry();
    const orchestrator = new AgentOrchestrator({
      registry,
      graph: makeGraph(),
      ownerIdentity: { whatsapp: { phoneNumber: '+1234' } },
    });

    expect(orchestrator.isOwnerSender('whatsapp', '+1234')).toBe(true);
    expect(orchestrator.isOwnerSender('whatsapp', '+9999')).toBe(false);
  });

  it('returns false for unknown platform', () => {
    const registry = new ChannelRegistry();
    const orchestrator = new AgentOrchestrator({
      registry,
      graph: makeGraph(),
      ownerIdentity: { telegram: { userId: 123 } },
    });

    expect(orchestrator.isOwnerSender('discord', 'user1')).toBe(false);
  });
});

describe('handleInbound — rule-based and LLM routing', () => {
  let db: Database.Database;
  let registry: ChannelRegistry;

  beforeEach(() => {
    db = new Database(':memory:');
    applySchema(db);
    registry = new ChannelRegistry();
    registry.sendTo = vi.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    db.close();
  });

  it('executes rule-based forward actions', async () => {
    const graph: CanvasGraph = {
      ...createEmptyGraph(),
      nodes: [makeNode({ id: 'n1' }), makeNode({ id: 'n2', platform: 'slack', label: '@design' })],
      workspaces: [makeWorkspace()],
      edges: [
        {
          id: 'e1',
          from: 'n1',
          to: 'n2',
          edgeType: 'manual' as const,
          rules: [{ type: 'always' as const, action: 'forward' }],
        },
      ],
    };

    const orchestrator = new AgentOrchestrator({
      registry,
      graph,
      ownerIdentity: { telegram: { userId: 123 } },
      agentMemory: new AgentMemory(db),
    });

    const message: InboundMessage = {
      sourceNodeId: 'n1',
      platform: 'telegram',
      senderId: 'user1',
      senderIsOwner: false,
      groupId: null,
      content: 'Forward me',
      contentType: 'text',
      timestamp: new Date().toISOString(),
    };

    await orchestrator.handleInbound(message);

    expect(registry.sendTo).toHaveBeenCalled();
  });

  it('returns early for unknown node', async () => {
    const orchestrator = new AgentOrchestrator({
      registry,
      graph: makeGraph(),
      ownerIdentity: { telegram: { userId: 123 } },
    });

    const message: InboundMessage = {
      sourceNodeId: 'nonexistent',
      platform: 'telegram',
      senderId: 'user1',
      senderIsOwner: false,
      groupId: null,
      content: 'Hello',
      contentType: 'text',
      timestamp: new Date().toISOString(),
    };

    await orchestrator.handleInbound(message);

    expect(registry.sendTo).not.toHaveBeenCalled();
  });

  it('tracks KPIs when kpiTracker is available', async () => {
    const kpiTracker = new KPITracker(db);
    const orchestrator = new AgentOrchestrator({
      registry,
      graph: makeGraph(),
      ownerIdentity: { telegram: { userId: 123 } },
      agentMemory: new AgentMemory(db),
      kpiTracker,
    });

    const message: InboundMessage = {
      sourceNodeId: 'n1',
      platform: 'telegram',
      senderId: 'user1',
      senderIsOwner: false,
      groupId: null,
      content: 'Hello',
      contentType: 'text',
      timestamp: new Date().toISOString(),
    };

    await orchestrator.handleInbound(message);

    const perf = kpiTracker.getPerformance('n1');
    expect(perf.messagesHandled).toBe(1);
  });
});

describe('queuePendingApprovals and owner notification', () => {
  let db: Database.Database;
  let registry: ChannelRegistry;

  beforeEach(() => {
    db = new Database(':memory:');
    applySchema(db);
    registry = new ChannelRegistry();
    registry.sendTo = vi.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    db.close();
  });

  it('queues pending approvals and notifies owner for approval-level agents', async () => {
    const checkpointManager = new CheckpointManager(db);
    const graph: CanvasGraph = {
      ...createEmptyGraph(),
      nodes: [
        makeNode({ id: 'n1', autonomy: 'approval', workspaceId: 'ws1' }),
        makeNode({ id: 'owner-ch', platform: 'telegram', label: '@owner-ch', workspaceId: 'ws1' }),
      ],
      workspaces: [makeWorkspace()],
      edges: [
        {
          id: 'e1',
          from: 'n1',
          to: 'owner-ch',
          edgeType: 'manual' as const,
          rules: [{ type: 'always' as const, action: 'forward' }],
        },
      ],
    };

    const orchestrator = new AgentOrchestrator({
      registry,
      graph,
      ownerIdentity: { telegram: { userId: 123 } },
      agentMemory: new AgentMemory(db),
      checkpointManager,
    });

    const message: InboundMessage = {
      sourceNodeId: 'n1',
      platform: 'telegram',
      senderId: 'user1',
      senderIsOwner: false,
      groupId: null,
      content: 'Needs approval',
      contentType: 'text',
      timestamp: new Date().toISOString(),
    };

    await orchestrator.handleInbound(message);

    const pending = checkpointManager.getPending();
    expect(pending.length).toBeGreaterThan(0);

    const sendTo = registry.sendTo as ReturnType<typeof vi.fn>;
    const calls = sendTo.mock.calls;
    const approvalCall = calls.find(
      (c: unknown[]) => typeof c[1] === 'string' && c[1].includes('[Approval Required]'),
    );
    expect(approvalCall).toBeDefined();
  });
});

describe('resolveAgent by label', () => {
  it('resolves agent by label (case insensitive)', async () => {
    const registry = new ChannelRegistry();
    registry.sendTo = vi.fn().mockResolvedValue(undefined);
    const orchestrator = new AgentOrchestrator({
      registry,
      graph: makeGraph([makeNode({ id: 'n1', label: '@Support_Bot' })]),
      ownerIdentity: { telegram: { userId: 123 } },
    });

    await orchestrator.handleOwnerCommand({
      type: 'instruct',
      agentId: '@support_bot',
      instruction: 'Do this',
    });

    expect(registry.sendTo).toHaveBeenCalled();
  });
});

describe('updateGraph', () => {
  it('replaces the graph reference', () => {
    const registry = new ChannelRegistry();
    const orchestrator = new AgentOrchestrator({
      registry,
      graph: makeGraph(),
      ownerIdentity: { telegram: { userId: 123 } },
    });

    expect(orchestrator.findNode('n1')).not.toBeNull();

    const newGraph = makeGraph([makeNode({ id: 'n99', label: '@new-bot' })]);
    orchestrator.updateGraph(newGraph);

    expect(orchestrator.findNode('n1')).toBeNull();
    expect(orchestrator.findNode('n99')).not.toBeNull();
  });
});

describe('handleInbound — LLM brain fallback', () => {
  let db: Database.Database;
  let registry: ChannelRegistry;

  beforeEach(() => {
    db = new Database(':memory:');
    applySchema(db);
    registry = new ChannelRegistry();
    registry.sendTo = vi.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    db.close();
  });

  it('uses LLM brain when no rule actions match', async () => {
    const mockBrain = {
      decideRouting: vi.fn().mockResolvedValue({
        actions: [{ type: 'reply', content: 'LLM response' }],
      }),
    };

    const orchestrator = new AgentOrchestrator({
      registry,
      graph: makeGraph(),
      ownerIdentity: { telegram: { userId: 123 } },
      agentMemory: new AgentMemory(db),
      brain: mockBrain as unknown as import('../llm-router.js').LLMRoutingBrain,
    });

    const message: InboundMessage = {
      sourceNodeId: 'n1',
      platform: 'telegram',
      senderId: 'user1',
      senderIsOwner: false,
      groupId: null,
      content: 'Help me with something',
      contentType: 'text',
      timestamp: new Date().toISOString(),
    };

    await orchestrator.handleInbound(message);

    expect(mockBrain.decideRouting).toHaveBeenCalled();
    expect(registry.sendTo).toHaveBeenCalledWith('n1', 'LLM response', null);
  });

  it('sends fallback reply on LLM failure', async () => {
    const mockBrain = {
      decideRouting: vi.fn().mockRejectedValue(new Error('LLM unavailable')),
    };

    const orchestrator = new AgentOrchestrator({
      registry,
      graph: makeGraph(),
      ownerIdentity: { telegram: { userId: 123 } },
      agentMemory: new AgentMemory(db),
      brain: mockBrain as unknown as import('../llm-router.js').LLMRoutingBrain,
    });

    const message: InboundMessage = {
      sourceNodeId: 'n1',
      platform: 'telegram',
      senderId: 'user1',
      senderIsOwner: false,
      groupId: null,
      content: 'Help me',
      contentType: 'text',
      timestamp: new Date().toISOString(),
    };

    await orchestrator.handleInbound(message);

    const sendTo = registry.sendTo as ReturnType<typeof vi.fn>;
    expect(sendTo).toHaveBeenCalled();
    const sentContent = sendTo.mock.calls[0]![1] as string;
    expect(sentContent).toContain('I encountered an issue');
  });

  it('escalates to owner on LLM failure for non-owner messages', async () => {
    const mockBrain = {
      decideRouting: vi.fn().mockRejectedValue(new Error('LLM unavailable')),
    };
    const escalationManager = new EscalationManager(db);

    const graph = makeGraph([
      makeNode({ id: 'n1', platform: 'telegram', label: '@bot' }),
      makeNode({ id: 'owner-ch', platform: 'telegram', label: '@owner-ch' }),
    ]);

    const orchestrator = new AgentOrchestrator({
      registry,
      graph,
      ownerIdentity: { telegram: { userId: 123 } },
      agentMemory: new AgentMemory(db),
      escalationManager,
      brain: mockBrain as unknown as import('../llm-router.js').LLMRoutingBrain,
    });

    const message: InboundMessage = {
      sourceNodeId: 'n1',
      platform: 'telegram',
      senderId: 'user1',
      senderIsOwner: false,
      groupId: null,
      content: 'Help me with billing',
      contentType: 'text',
      timestamp: new Date().toISOString(),
    };

    await orchestrator.handleInbound(message);

    expect(escalationManager.getPendingCount()).toBe(1);
  });

  it('does not escalate when sender is owner', async () => {
    const mockBrain = {
      decideRouting: vi.fn().mockRejectedValue(new Error('LLM unavailable')),
    };
    const escalationManager = new EscalationManager(db);

    const orchestrator = new AgentOrchestrator({
      registry,
      graph: makeGraph(),
      ownerIdentity: { telegram: { userId: 123 } },
      agentMemory: new AgentMemory(db),
      escalationManager,
      brain: mockBrain as unknown as import('../llm-router.js').LLMRoutingBrain,
    });

    const message: InboundMessage = {
      sourceNodeId: 'n1',
      platform: 'telegram',
      senderId: '123',
      senderIsOwner: true,
      groupId: null,
      content: 'Help me',
      contentType: 'text',
      timestamp: new Date().toISOString(),
    };

    await orchestrator.handleInbound(message);

    expect(escalationManager.getPendingCount()).toBe(0);
  });
});

describe('handleInbound — rule action error handling', () => {
  let db: Database.Database;
  let registry: ChannelRegistry;

  beforeEach(() => {
    db = new Database(':memory:');
    applySchema(db);
    registry = new ChannelRegistry();
    registry.sendTo = vi.fn().mockRejectedValue(new Error('send failed'));
  });

  afterEach(() => {
    db.close();
  });

  it('continues processing after rule action failure', async () => {
    const graph: CanvasGraph = {
      ...createEmptyGraph(),
      nodes: [makeNode({ id: 'n1' }), makeNode({ id: 'n2', platform: 'slack', label: '@slack' })],
      workspaces: [makeWorkspace()],
      edges: [
        {
          id: 'e1',
          from: 'n1',
          to: 'n2',
          edgeType: 'manual' as const,
          rules: [{ type: 'always' as const, action: 'forward' }],
        },
      ],
    };

    const orchestrator = new AgentOrchestrator({
      registry,
      graph,
      ownerIdentity: { telegram: { userId: 123 } },
      agentMemory: new AgentMemory(db),
    });

    const message: InboundMessage = {
      sourceNodeId: 'n1',
      platform: 'telegram',
      senderId: 'user1',
      senderIsOwner: false,
      groupId: null,
      content: 'Forward me',
      contentType: 'text',
      timestamp: new Date().toISOString(),
    };

    // Should not throw despite sendTo failing
    await orchestrator.handleInbound(message);
  });
});

describe('handleOwnerCommand — agent not found for review/fire', () => {
  it('review returns early for unknown agent', async () => {
    const registry = new ChannelRegistry();
    registry.sendTo = vi.fn();
    const orchestrator = new AgentOrchestrator({
      registry,
      graph: makeGraph(),
      ownerIdentity: { telegram: { userId: 123 } },
    });

    await orchestrator.handleOwnerCommand({ type: 'review', agentId: 'nonexistent' });
    expect(registry.sendTo).not.toHaveBeenCalled();
  });

  it('fire returns early for unknown agent', async () => {
    const registry = new ChannelRegistry();
    registry.stop = vi.fn();
    const orchestrator = new AgentOrchestrator({
      registry,
      graph: makeGraph(),
      ownerIdentity: { telegram: { userId: 123 } },
    });

    await orchestrator.handleOwnerCommand({ type: 'fire', agentId: 'nonexistent' });
    expect(registry.stop).not.toHaveBeenCalled();
  });
});

describe('findGroupForNode', () => {
  it('returns group ID for node in workspace with matching platform group', async () => {
    const registry = new ChannelRegistry();
    registry.sendTo = vi.fn().mockResolvedValue(undefined);
    const graph = makeGraph(
      [
        makeNode({ id: 'n1', platform: 'telegram', workspaceId: 'ws1' }),
        makeNode({
          id: 'n2',
          platform: 'telegram',
          label: '@other',
          workspaceId: 'ws1',
        }),
      ],
      [
        makeWorkspace({
          groups: [
            {
              platform: 'telegram',
              groupId: 'tg-group-123',
              name: 'Support Chat',
              ownerMemberId: '123',
              autoCreated: false,
            },
          ],
        }),
      ],
    );

    const orchestrator = new AgentOrchestrator({
      registry,
      graph,
      ownerIdentity: { telegram: { userId: 123 } },
    });

    // Forward triggers findGroupForNode internally
    const source: InboundMessage = {
      sourceNodeId: 'n1',
      platform: 'telegram',
      senderId: '123',
      senderIsOwner: true,
      groupId: null,
      content: 'test',
      contentType: 'text',
      timestamp: new Date().toISOString(),
    };

    await orchestrator.executeAction(
      { type: 'forward', targetNodeId: 'n2', content: 'Hello' },
      source,
    );

    const sendTo = registry.sendTo as ReturnType<typeof vi.fn>;
    expect(sendTo).toHaveBeenCalledWith('n2', expect.any(String), 'tg-group-123');
  });
});

describe('sweepOverdueDelegations', () => {
  let db: Database.Database;
  let registry: ChannelRegistry;

  beforeEach(() => {
    db = new Database(':memory:');
    applySchema(db);
    registry = new ChannelRegistry();
    registry.sendTo = vi.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    db.close();
  });

  it('escalates overdue tasks', async () => {
    const escalationManager = new EscalationManager(db);
    const delegationTracker = new DelegationTracker(db);
    const agentMemory = new AgentMemory(db);
    const graph = makeGraph([
      makeNode({ id: 'agent1', platform: 'telegram', label: '@agent1' }),
      makeNode({ id: 'owner-ch', platform: 'telegram', label: '@owner-ch' }),
    ]);

    const orchestrator = new AgentOrchestrator({
      registry,
      graph,
      ownerIdentity: { telegram: { userId: 123 } },
      agentMemory,
      escalationManager,
      delegationTracker,
    });

    // Insert an overdue task
    db.prepare(
      `INSERT INTO agent_tasks (id, workspace_id, assigned_to, delegated_by, title, priority, deadline)
       VALUES ('t1', 'ws1', 'agent1', 'owner', 'Overdue task', 'high', datetime('now', '-10 minutes'))`,
    ).run();

    await orchestrator.sweepOverdueDelegations();

    expect(escalationManager.getPendingCount()).toBe(1);
    // Task should be cancelled
    const task = db.prepare('SELECT status FROM agent_tasks WHERE id = ?').get('t1') as {
      status: string;
    };
    expect(task.status).toBe('cancelled');
  });

  it('does nothing when no tasks are overdue', async () => {
    const escalationManager = new EscalationManager(db);
    const delegationTracker = new DelegationTracker(db);
    const agentMemory = new AgentMemory(db);

    const orchestrator = new AgentOrchestrator({
      registry,
      graph: makeGraph(),
      ownerIdentity: { telegram: { userId: 123 } },
      agentMemory,
      escalationManager,
      delegationTracker,
    });

    await orchestrator.sweepOverdueDelegations();

    expect(escalationManager.getPendingCount()).toBe(0);
  });

  it('marks overdue tasks as cancelled', async () => {
    const escalationManager = new EscalationManager(db);
    const delegationTracker = new DelegationTracker(db);
    const agentMemory = new AgentMemory(db);

    const orchestrator = new AgentOrchestrator({
      registry,
      graph: makeGraph(),
      ownerIdentity: { telegram: { userId: 123 } },
      agentMemory,
      escalationManager,
      delegationTracker,
    });

    db.prepare(
      `INSERT INTO agent_tasks (id, workspace_id, assigned_to, title, priority, deadline)
       VALUES ('t1', 'ws1', 'n1', 'Task A', 'normal', datetime('now', '-5 minutes'))`,
    ).run();
    db.prepare(
      `INSERT INTO agent_tasks (id, workspace_id, assigned_to, title, priority, deadline)
       VALUES ('t2', 'ws1', 'n1', 'Task B', 'normal', datetime('now', '-1 minutes'))`,
    ).run();

    await orchestrator.sweepOverdueDelegations();

    const tasks = db.prepare('SELECT status FROM agent_tasks ORDER BY id').all() as Array<{
      status: string;
    }>;
    expect(tasks.every((t) => t.status === 'cancelled')).toBe(true);
    expect(escalationManager.getPendingCount()).toBe(2);
  });
});
