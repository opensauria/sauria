import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleOwnerCommand } from '../owner-commands.js';
import type { OwnerCommandContext } from '../owner-commands.js';
import type { AgentNode, CanvasGraph, OwnerCommand } from '../types.js';

vi.mock('../utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('../orchestrator-helpers.js', () => ({
  isOwnerChannelNode: vi.fn(() => false),
}));

function makeNode(overrides: Partial<AgentNode> = {}): AgentNode {
  return {
    id: 'agent-1',
    label: '@test_bot',
    platform: 'telegram',
    role: 'specialist',
    autonomy: 'semi',
    status: 'connected',
    workspaceId: 'ws-1',
    ...overrides,
  } as AgentNode;
}

function makeGraph(overrides: Partial<CanvasGraph> = {}): CanvasGraph {
  return {
    nodes: [makeNode()],
    edges: [],
    workspaces: [{ id: 'ws-1', name: 'Engineering', purpose: 'Dev', topics: [], groups: [] }],
    globalInstructions: '',
    ...overrides,
  } as CanvasGraph;
}

function makeContext(overrides: Partial<OwnerCommandContext> = {}): OwnerCommandContext {
  const graph = makeGraph();
  return {
    getGraph: vi.fn(() => graph),
    setGraph: vi.fn(),
    registry: {
      sendTo: vi.fn().mockResolvedValue(undefined),
      sendToWorkspace: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      unregister: vi.fn(),
    } as unknown as OwnerCommandContext['registry'],
    kpiTracker: null,
    ownerIdentity: { telegram: { userId: 123 } },
    resolveAgent: vi.fn((id: string) => (id === 'agent-1' ? makeNode() : null)),
    updateNode: vi.fn(),
    persistGraph: vi.fn(),
    findGroupForNode: vi.fn(() => null),
    ...overrides,
  };
}

describe('handleOwnerCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('instruct', () => {
    it('sends instruction to resolved agent', async () => {
      const ctx = makeContext();
      const command: OwnerCommand = { type: 'instruct', agentId: 'agent-1', instruction: 'Do X' };
      await handleOwnerCommand(command, ctx);
      expect(ctx.registry.sendTo).toHaveBeenCalledWith('agent-1', 'Do X', null);
    });

    it('does nothing when agent not found', async () => {
      const ctx = makeContext();
      const command: OwnerCommand = {
        type: 'instruct',
        agentId: 'missing',
        instruction: 'Do X',
      };
      await handleOwnerCommand(command, ctx);
      expect(ctx.registry.sendTo).not.toHaveBeenCalled();
    });
  });

  describe('broadcast', () => {
    it('sends message to all workspaces', async () => {
      const ctx = makeContext();
      const command: OwnerCommand = { type: 'broadcast', message: 'Hello all' };
      await handleOwnerCommand(command, ctx);
      expect(ctx.registry.sendToWorkspace).toHaveBeenCalledWith(
        'ws-1',
        'Hello all',
        expect.anything(),
      );
    });
  });

  describe('promote', () => {
    it('updates agent autonomy and persists graph', async () => {
      const ctx = makeContext();
      const command: OwnerCommand = {
        type: 'promote',
        agentId: 'agent-1',
        newAutonomy: 'full',
      };
      await handleOwnerCommand(command, ctx);
      expect(ctx.updateNode).toHaveBeenCalledWith('agent-1', { autonomy: 'full' });
      expect(ctx.persistGraph).toHaveBeenCalled();
    });

    it('does not persist when agent not found', async () => {
      const ctx = makeContext();
      const command: OwnerCommand = {
        type: 'promote',
        agentId: 'missing',
        newAutonomy: 'full',
      };
      await handleOwnerCommand(command, ctx);
      expect(ctx.updateNode).not.toHaveBeenCalled();
      expect(ctx.persistGraph).not.toHaveBeenCalled();
    });
  });

  describe('reassign', () => {
    it('moves agent to target workspace and persists', async () => {
      const ctx = makeContext();
      const command: OwnerCommand = {
        type: 'reassign',
        agentId: 'agent-1',
        newWorkspaceId: 'ws-1',
      };
      await handleOwnerCommand(command, ctx);
      expect(ctx.updateNode).toHaveBeenCalledWith('agent-1', { workspaceId: 'ws-1' });
      expect(ctx.persistGraph).toHaveBeenCalled();
    });

    it('does not persist when workspace not found', async () => {
      const ctx = makeContext();
      const command: OwnerCommand = {
        type: 'reassign',
        agentId: 'agent-1',
        newWorkspaceId: 'nonexistent',
      };
      await handleOwnerCommand(command, ctx);
      expect(ctx.updateNode).not.toHaveBeenCalled();
      expect(ctx.persistGraph).not.toHaveBeenCalled();
    });

    it('resolves workspace by name', async () => {
      const ctx = makeContext();
      const command: OwnerCommand = {
        type: 'reassign',
        agentId: 'agent-1',
        newWorkspaceId: 'Engineering',
      };
      await handleOwnerCommand(command, ctx);
      expect(ctx.updateNode).toHaveBeenCalledWith('agent-1', { workspaceId: 'ws-1' });
    });
  });

  describe('fire', () => {
    it('stops channel, unregisters, removes node, and persists', async () => {
      const ctx = makeContext();
      const command: OwnerCommand = { type: 'fire', agentId: 'agent-1' };
      await handleOwnerCommand(command, ctx);
      expect(ctx.registry.stop).toHaveBeenCalledWith('agent-1');
      expect(ctx.registry.unregister).toHaveBeenCalledWith('agent-1');
      expect(ctx.setGraph).toHaveBeenCalledWith(
        expect.objectContaining({
          nodes: [],
        }),
      );
      expect(ctx.persistGraph).toHaveBeenCalled();
    });

    it('does nothing when agent not found', async () => {
      const ctx = makeContext();
      const command: OwnerCommand = { type: 'fire', agentId: 'missing' };
      await handleOwnerCommand(command, ctx);
      expect(ctx.registry.stop).not.toHaveBeenCalled();
      expect(ctx.persistGraph).not.toHaveBeenCalled();
    });
  });

  describe('hire', () => {
    it('logs placeholder without mutating graph', async () => {
      const ctx = makeContext();
      const command: OwnerCommand = {
        type: 'hire',
        platform: 'telegram',
        workspace: 'Engineering',
        role: 'analyst',
      };
      await handleOwnerCommand(command, ctx);
      expect(ctx.persistGraph).not.toHaveBeenCalled();
    });
  });

  describe('pause', () => {
    it('pauses workspace by id and persists', async () => {
      const node1 = makeNode({ id: 'agent-1', workspaceId: 'ws-1' });
      const node2 = makeNode({ id: 'agent-2', workspaceId: 'ws-1' });
      const graph = makeGraph({
        nodes: [node1, node2],
        workspaces: [{ id: 'ws-1', name: 'Engineering', purpose: 'Dev', topics: [], groups: [] }],
      });
      const ctx = makeContext({
        getGraph: vi.fn(() => graph),
      });
      const command: OwnerCommand = { type: 'pause', workspaceId: 'ws-1' };
      await handleOwnerCommand(command, ctx);
      expect(ctx.setGraph).toHaveBeenCalled();
      expect(ctx.persistGraph).toHaveBeenCalled();
    });

    it('pauses workspace by name', async () => {
      const node1 = makeNode({ id: 'agent-1', workspaceId: 'ws-1' });
      const graph = makeGraph({
        nodes: [node1],
        workspaces: [{ id: 'ws-1', name: 'Engineering', purpose: 'Dev', topics: [], groups: [] }],
      });
      const ctx = makeContext({
        getGraph: vi.fn(() => graph),
      });
      const command: OwnerCommand = { type: 'pause', workspaceId: 'Engineering' };
      await handleOwnerCommand(command, ctx);
      expect(ctx.setGraph).toHaveBeenCalled();
      expect(ctx.persistGraph).toHaveBeenCalled();
    });

    it('does not persist when workspace not found', async () => {
      const ctx = makeContext();
      const command: OwnerCommand = { type: 'pause', workspaceId: 'nonexistent' };
      await handleOwnerCommand(command, ctx);
      expect(ctx.persistGraph).not.toHaveBeenCalled();
    });

    it('stops channels for all nodes in workspace', async () => {
      const node1 = makeNode({ id: 'agent-1', workspaceId: 'ws-1' });
      const node2 = makeNode({ id: 'agent-2', workspaceId: 'ws-1' });
      const graph = makeGraph({
        nodes: [node1, node2],
        workspaces: [{ id: 'ws-1', name: 'Engineering', purpose: 'Dev', topics: [], groups: [] }],
      });
      const ctx = makeContext({
        getGraph: vi.fn(() => graph),
      });
      const command: OwnerCommand = { type: 'pause', workspaceId: 'ws-1' };
      await handleOwnerCommand(command, ctx);
      expect(ctx.registry.stop).toHaveBeenCalledWith('agent-1');
      expect(ctx.registry.stop).toHaveBeenCalledWith('agent-2');
    });

    it('continues stopping other nodes when one channel stop fails', async () => {
      const node1 = makeNode({ id: 'agent-1', workspaceId: 'ws-1' });
      const node2 = makeNode({ id: 'agent-2', workspaceId: 'ws-1' });
      const graph = makeGraph({
        nodes: [node1, node2],
        workspaces: [{ id: 'ws-1', name: 'Engineering', purpose: 'Dev', topics: [], groups: [] }],
      });
      const stopFn = vi.fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValueOnce(undefined);
      const ctx = makeContext({
        getGraph: vi.fn(() => graph),
        registry: {
          ...makeContext().registry,
          stop: stopFn,
        } as unknown as OwnerCommandContext['registry'],
      });
      const command: OwnerCommand = { type: 'pause', workspaceId: 'ws-1' };
      await handleOwnerCommand(command, ctx);
      expect(stopFn).toHaveBeenCalledTimes(2);
      expect(ctx.persistGraph).toHaveBeenCalled();
    });
  });

  describe('review', () => {
    it('does nothing when agent not found', async () => {
      const ctx = makeContext();
      const command: OwnerCommand = { type: 'review', agentId: 'missing' };
      await handleOwnerCommand(command, ctx);
      expect(ctx.registry.sendTo).not.toHaveBeenCalled();
    });

    it('sends review summary to owner channel node', async () => {
      const { isOwnerChannelNode } = await import('../orchestrator-helpers.js');
      (isOwnerChannelNode as ReturnType<typeof vi.fn>).mockReturnValue(true);

      const ownerNode = makeNode({ id: 'owner-tg', platform: 'telegram' });
      const graph = makeGraph({ nodes: [makeNode(), ownerNode] });
      const ctx = makeContext({
        getGraph: vi.fn(() => graph),
      });
      const command: OwnerCommand = { type: 'review', agentId: 'agent-1' };
      await handleOwnerCommand(command, ctx);

      expect(ctx.registry.sendTo).toHaveBeenCalled();
    });

    it('includes KPI data when kpiTracker is available', async () => {
      const { isOwnerChannelNode } = await import('../orchestrator-helpers.js');
      (isOwnerChannelNode as ReturnType<typeof vi.fn>).mockReturnValue(true);

      const ownerNode = makeNode({ id: 'owner-tg', platform: 'telegram' });
      const graph = makeGraph({ nodes: [makeNode(), ownerNode] });
      const kpiTracker = {
        getPerformance: vi.fn().mockReturnValue({
          messagesHandled: 42,
          tasksCompleted: 10,
          avgResponseTimeMs: 250,
        }),
      };
      const ctx = makeContext({
        getGraph: vi.fn(() => graph),
        kpiTracker: kpiTracker as unknown as OwnerCommandContext['kpiTracker'],
      });
      const command: OwnerCommand = { type: 'review', agentId: 'agent-1' };
      await handleOwnerCommand(command, ctx);

      const sendCall = (ctx.registry.sendTo as ReturnType<typeof vi.fn>).mock.calls[0];
      const summary = sendCall?.[1] as string;
      expect(summary).toContain('42');
      expect(summary).toContain('10');
      expect(summary).toContain('250');
    });

    it('does not persist graph', async () => {
      const ctx = makeContext();
      const command: OwnerCommand = { type: 'review', agentId: 'agent-1' };
      await handleOwnerCommand(command, ctx);
      expect(ctx.persistGraph).not.toHaveBeenCalled();
    });
  });

  describe('fire — error handling', () => {
    it('still removes node when registry.stop throws', async () => {
      const ctx = makeContext({
        registry: {
          ...makeContext().registry,
          stop: vi.fn().mockRejectedValue(new Error('stop failed')),
          unregister: vi.fn(),
          sendTo: vi.fn(),
          sendToWorkspace: vi.fn(),
        } as unknown as OwnerCommandContext['registry'],
      });
      const command: OwnerCommand = { type: 'fire', agentId: 'agent-1' };
      await handleOwnerCommand(command, ctx);
      expect(ctx.setGraph).toHaveBeenCalled();
      expect(ctx.persistGraph).toHaveBeenCalled();
    });
  });

  describe('reassign — agent not found', () => {
    it('does nothing when agent not found', async () => {
      const ctx = makeContext();
      const command: OwnerCommand = {
        type: 'reassign',
        agentId: 'missing',
        newWorkspaceId: 'ws-1',
      };
      await handleOwnerCommand(command, ctx);
      expect(ctx.updateNode).not.toHaveBeenCalled();
      expect(ctx.persistGraph).not.toHaveBeenCalled();
    });
  });

  describe('instruct — with group', () => {
    it('passes group from findGroupForNode to sendTo', async () => {
      const ctx = makeContext({
        findGroupForNode: vi.fn(() => 'tg-grp-123'),
      });
      const command: OwnerCommand = { type: 'instruct', agentId: 'agent-1', instruction: 'Do Y' };
      await handleOwnerCommand(command, ctx);
      expect(ctx.registry.sendTo).toHaveBeenCalledWith('agent-1', 'Do Y', 'tg-grp-123');
    });
  });
});
