import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { applySchema } from '../../db/schema.js';
import { AgentOrchestrator } from '../orchestrator.js';
import { AgentMemory } from '../agent-memory.js';
import type { CanvasGraph, OwnerIdentity, InboundMessage } from '../types.js';
import { DEFAULT_GROUP_BEHAVIOR, createEmptyGraph } from '../types.js';
import { ChannelRegistry } from '../../channels/registry.js';

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
    ],
  };
}

describe('AgentOrchestrator', () => {
  let orchestrator: AgentOrchestrator;
  let registry: ChannelRegistry;
  const ownerIdentity: OwnerIdentity = { telegram: { userId: 123 } };

  beforeEach(() => {
    registry = new ChannelRegistry();
    orchestrator = new AgentOrchestrator({
      registry,
      graph: makeGraph(),
      ownerIdentity,
    });
  });

  it('detects owner messages on telegram', () => {
    const isOwner = orchestrator.isOwnerSender('telegram', '123');
    expect(isOwner).toBe(true);
  });

  it('detects non-owner messages', () => {
    const isOwner = orchestrator.isOwnerSender('telegram', '999');
    expect(isOwner).toBe(false);
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
    const sentContent = sendTo.mock.calls[0][1] as string;

    expect(sentContent).toContain('[Forwarded from @support_bot]');
    expect(sentContent).toContain('Schedule a meeting with design');
    expect(sentContent).toContain('Please handle design meeting');
  });
});
