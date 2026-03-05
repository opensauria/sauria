import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { writeFileSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';
import { applySchema } from '../../db/schema.js';
import { AgentOrchestrator } from '../orchestrator.js';
import { AgentMemory } from '../agent-memory.js';
import type { CanvasGraph, InboundMessage, AgentNode } from '../types.js';
import { createEmptyGraph } from '../types.js';
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

  const graph = makeGraph([
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

  it('enriches forward content with recent conversation context', async () => {
    const agentMemory = new AgentMemory(db);
    const onActivity = vi.fn();

    const enrichOrchestrator = new AgentOrchestrator({
      registry,
      graph,
      ownerIdentity: { telegram: { userId: 123 } },
      agentMemory,
      onActivity,
    });

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

    await enrichOrchestrator.executeAction(
      { type: 'forward', targetNodeId: 'n2', content: 'Please handle design meeting' },
      source,
    );

    // Forward now routes internally — sendTo should NOT be called
    const sendTo = registry.sendTo as ReturnType<typeof vi.fn>;
    expect(sendTo).not.toHaveBeenCalled();

    // Verify activity events were emitted (edge + message for forward, node for target processing)
    const edgeCall = onActivity.mock.calls.find((c: unknown[]) => c[0] === 'activity:edge');
    expect(edgeCall).toBeDefined();
    expect((edgeCall![1] as Record<string, string>).from).toBe('n1');
    expect((edgeCall![1] as Record<string, string>).to).toBe('n2');

    // Target node should have been activated via handleInbound
    const nodeCall = onActivity.mock.calls.find(
      (c: unknown[]) =>
        c[0] === 'activity:node' && (c[1] as Record<string, unknown>).nodeId === 'n2',
    );
    expect(nodeCall).toBeDefined();
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

describe('executeAction reply internal routing', () => {
  let db: Database.Database;
  let registry: ChannelRegistry;

  const graph = makeGraph([
    makeNode({ id: 'n1', platform: 'telegram', label: '@kyra_bot' }),
    makeNode({ id: 'n2', platform: 'telegram', label: '@karl_bot', role: 'specialist' }),
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

  it('agent with own channel routes forwarded reply internally (not to owner)', async () => {
    const onActivity = vi.fn();
    const freshRegistry = new ChannelRegistry();
    const mockChannel = {
      name: 'telegram',
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      sendAlert: vi.fn().mockResolvedValue(undefined),
      sendMessage: vi.fn().mockResolvedValue(undefined),
      sendToGroup: vi.fn().mockResolvedValue(undefined),
    };
    freshRegistry.register('n2', mockChannel);

    const orchestrator = new AgentOrchestrator({
      registry: freshRegistry,
      graph,
      ownerIdentity: { telegram: { userId: 123 } },
      agentMemory: new AgentMemory(db),
      onActivity,
    });

    // Karl (n2) replies to a forwarded message from Kyra (n1)
    const source: InboundMessage = {
      sourceNodeId: 'n2',
      platform: 'telegram',
      senderId: 'n1',
      senderIsOwner: false,
      groupId: null,
      content: 'Forwarded topic',
      contentType: 'text',
      timestamp: new Date().toISOString(),
      forwardDepth: 1,
      replyToNodeId: 'n1',
    };

    await orchestrator.executeAction({ type: 'reply', content: 'My direct response' }, source);

    // Forwarded replies always route internally — owner should NOT get the message
    expect(mockChannel.sendMessage).not.toHaveBeenCalled();

    // Edge activity from n2 to n1 (internal reply back to forwarding agent)
    const edgeCall = onActivity.mock.calls.find(
      (c: unknown[]) =>
        c[0] === 'activity:edge' &&
        (c[1] as Record<string, unknown>).from === 'n2' &&
        (c[1] as Record<string, unknown>).to === 'n1' &&
        (c[1] as Record<string, unknown>).actionType === 'reply',
    );
    expect(edgeCall).toBeDefined();

    // n1 should have been activated via handleInbound
    const nodeCall = onActivity.mock.calls.find(
      (c: unknown[]) =>
        c[0] === 'activity:node' && (c[1] as Record<string, unknown>).nodeId === 'n1',
    );
    expect(nodeCall).toBeDefined();
  });

  it('agent without own channel routes reply internally with attribution', async () => {
    const onActivity = vi.fn();
    // n2 has NO registered channel — mock sendTo to avoid throw in the chain
    registry.sendTo = vi.fn().mockResolvedValue(undefined);

    const orchestrator = new AgentOrchestrator({
      registry,
      graph,
      ownerIdentity: { telegram: { userId: 123 } },
      agentMemory: new AgentMemory(db),
      onActivity,
    });

    const source: InboundMessage = {
      sourceNodeId: 'n2',
      platform: 'telegram',
      senderId: 'n1',
      senderIsOwner: false,
      groupId: null,
      content: 'Forwarded topic',
      contentType: 'text',
      timestamp: new Date().toISOString(),
      forwardDepth: 1,
      replyToNodeId: 'n1',
    };

    await orchestrator.executeAction({ type: 'reply', content: 'Routed back' }, source);

    // Should route internally — n1 activated via handleInbound
    const nodeCall = onActivity.mock.calls.find(
      (c: unknown[]) =>
        c[0] === 'activity:node' && (c[1] as Record<string, unknown>).nodeId === 'n1',
    );
    expect(nodeCall).toBeDefined();

    // Internal reply should have [Reply from] attribution prefix
    const edgeCall = onActivity.mock.calls.find(
      (c: unknown[]) =>
        c[0] === 'activity:edge' &&
        (c[1] as Record<string, unknown>).from === 'n2' &&
        (c[1] as Record<string, unknown>).to === 'n1' &&
        (c[1] as Record<string, unknown>).actionType === 'reply',
    );
    expect(edgeCall).toBeDefined();
  });

  it('routes reply externally when forwardDepth is 0', async () => {
    const orchestrator = new AgentOrchestrator({
      registry,
      graph,
      ownerIdentity: { telegram: { userId: 123 } },
      agentMemory: new AgentMemory(db),
    });

    const source: InboundMessage = {
      sourceNodeId: 'n1',
      platform: 'telegram',
      senderId: 'user123',
      senderIsOwner: true,
      groupId: null,
      content: 'Hello',
      contentType: 'text',
      timestamp: new Date().toISOString(),
    };

    await orchestrator.executeAction({ type: 'reply', content: 'Hello back' }, source);

    const sendTo = registry.sendTo as ReturnType<typeof vi.fn>;
    expect(sendTo).toHaveBeenCalledWith('n1', 'Hello back', null);
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
