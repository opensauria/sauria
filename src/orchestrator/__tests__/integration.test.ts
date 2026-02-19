import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { AgentOrchestrator } from '../orchestrator.js';
import { AgentMemory } from '../agent-memory.js';
import { KPITracker } from '../kpi-tracker.js';
import { CheckpointManager } from '../checkpoint.js';
import { ChannelRegistry } from '../../channels/registry.js';
import type { Channel } from '../../channels/base.js';
import type { CanvasGraph, OwnerIdentity, InboundMessage, OwnerCommand } from '../types.js';
import { DEFAULT_GROUP_BEHAVIOR, createEmptyGraph } from '../types.js';
import { applySchema } from '../../db/schema.js';

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

function makeGraph(): CanvasGraph {
  return {
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
        label: 'bot-alpha',
        photo: null,
        position: { x: 0, y: 0 },
        status: 'connected',
        credentials: 'key1',
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
        label: 'bot-beta',
        photo: null,
        position: { x: 100, y: 0 },
        status: 'connected',
        credentials: 'key2',
        meta: {},
        workspaceId: 'ws1',
        role: 'specialist',
        autonomy: 'full',
        instructions: '',
        groupBehavior: DEFAULT_GROUP_BEHAVIOR,
      },
    ],
    edges: [
      {
        id: 'e1',
        from: 'n1',
        to: 'n2',
        edgeType: 'intra_workspace',
        rules: [{ type: 'always', action: 'forward' }],
      },
    ],
  };
}

function makeMessage(overrides: Partial<InboundMessage> = {}): InboundMessage {
  return {
    sourceNodeId: 'n1',
    platform: 'telegram',
    senderId: '123',
    senderIsOwner: true,
    groupId: null,
    content: 'test message',
    contentType: 'text',
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

describe('Orchestrator Integration', () => {
  let db: Database.Database;
  let orchestrator: AgentOrchestrator;
  let registry: ChannelRegistry;
  let ch1: Channel;
  let ch2: Channel;
  let agentMemory: AgentMemory;
  let kpiTracker: KPITracker;
  let checkpointManager: CheckpointManager;
  const ownerIdentity: OwnerIdentity = { telegram: { userId: 123 } };

  beforeEach(() => {
    db = new Database(':memory:');
    applySchema(db);

    registry = new ChannelRegistry();
    ch1 = mockChannel('telegram');
    ch2 = mockChannel('slack');
    registry.register('n1', ch1);
    registry.register('n2', ch2);

    agentMemory = new AgentMemory(db);
    kpiTracker = new KPITracker(db);
    checkpointManager = new CheckpointManager(db);

    orchestrator = new AgentOrchestrator({
      registry,
      graph: makeGraph(),
      ownerIdentity,
      db,
      agentMemory,
      kpiTracker,
      checkpointManager,
    });
  });

  it('routes message through edge rules to target channel', async () => {
    await orchestrator.handleInbound(makeMessage());
    expect(ch2.sendMessage).toHaveBeenCalled();
  });

  it('records messages in agent memory', async () => {
    await orchestrator.handleInbound(makeMessage());
    const conversations = db.prepare('SELECT * FROM agent_conversations').all();
    expect(conversations.length).toBeGreaterThan(0);
  });

  it('tracks KPIs after message handling', async () => {
    await orchestrator.handleInbound(makeMessage());
    const perf = kpiTracker.getPerformance('n1');
    expect(perf.messagesHandled).toBe(1);
  });

  it('applies autonomy filtering and queues approvals for approval-level nodes', async () => {
    // Change n1 to approval autonomy
    const graph = makeGraph();
    const mutableNodes = [...graph.nodes];
    mutableNodes[0] = { ...mutableNodes[0]!, autonomy: 'approval' };
    const approvalGraph: CanvasGraph = { ...graph, nodes: mutableNodes };

    const approvalOrchestrator = new AgentOrchestrator({
      registry,
      graph: approvalGraph,
      ownerIdentity,
      db,
      agentMemory,
      kpiTracker,
      checkpointManager,
    });

    // Non-owner message should trigger approval
    await approvalOrchestrator.handleInbound(
      makeMessage({ senderIsOwner: false, senderId: '999' }),
    );

    const pending = checkpointManager.getPending();
    expect(pending.length).toBeGreaterThan(0);
  });

  it('handles assign action — inserts task and forwards', async () => {
    await orchestrator.executeAction(
      { type: 'assign', targetNodeId: 'n2', task: 'Review PR', priority: 'high' },
      makeMessage(),
    );

    const tasks = db.prepare('SELECT * FROM agent_tasks').all();
    expect(tasks.length).toBe(1);
    expect(ch2.sendMessage).toHaveBeenCalledWith(expect.stringContaining('[Task] Review PR'), null);
  });

  it('handles learn action — stores fact in memory', async () => {
    await orchestrator.executeAction(
      { type: 'learn', fact: 'The sky is blue', topics: ['science'] },
      makeMessage(),
    );

    const facts = db.prepare('SELECT * FROM agent_memory').all();
    expect(facts.length).toBe(1);
  });

  it('owner instruct command sends to target agent', async () => {
    const command: OwnerCommand = {
      type: 'instruct',
      agentId: 'bot-alpha',
      instruction: 'Deploy now',
    };
    await orchestrator.handleOwnerCommand(command);
    expect(ch1.sendMessage).toHaveBeenCalledWith('Deploy now', null);
  });

  it('owner promote command changes autonomy level', async () => {
    const command: OwnerCommand = { type: 'promote', agentId: 'bot-alpha', newAutonomy: 'full' };
    await orchestrator.handleOwnerCommand(command);

    const node = orchestrator.findNode('n1');
    expect(node?.autonomy).toBe('full');
  });

  it('owner fire command removes agent from graph', async () => {
    const command: OwnerCommand = { type: 'fire', agentId: 'bot-beta' };
    await orchestrator.handleOwnerCommand(command);

    expect(orchestrator.findNode('n2')).toBeNull();
    expect(ch2.stop).toHaveBeenCalled();
  });

  it('owner review command sends performance summary', async () => {
    // Record some KPIs first
    kpiTracker.recordMessageHandled('n1', 150);
    kpiTracker.recordMessageHandled('n1', 250);

    const command: OwnerCommand = { type: 'review', agentId: 'bot-alpha' };
    await orchestrator.handleOwnerCommand(command);

    // Review is sent to owner's telegram channel (n1)
    expect(ch1.sendMessage).toHaveBeenCalledWith(expect.stringContaining('[Review]'), null);
  });

  it('executes approved actions after approval', async () => {
    const approvalId = checkpointManager.queueForApproval('n1', 'ws1', 'Test approval', [
      { type: 'forward', targetNodeId: 'n2', content: 'approved content' },
    ]);

    const actions = checkpointManager.approve(approvalId);
    const executed = await orchestrator.executeApprovedActions('n1', actions);

    expect(executed).toBe(1);
    expect(ch2.sendMessage).toHaveBeenCalledWith('approved content', null);
  });
});
