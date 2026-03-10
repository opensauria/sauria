import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleInbound } from '../inbound-handler.js';
import type { AgentNode, InboundMessage, RoutingAction, Workspace } from '../types.js';

vi.mock('../utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('../routing.js', () => ({
  evaluateEdgeRules: vi.fn(() => []),
}));

vi.mock('@sauria/ipc-protocol', () => ({
  IPC_EVENTS: { ACTIVITY_NODE: 'activity:node' },
}));

function makeNode(overrides: Partial<AgentNode> = {}): AgentNode {
  return {
    id: 'node-1',
    label: '@test_bot',
    platform: 'telegram',
    role: 'specialist',
    autonomy: 'semi',
    status: 'connected',
    workspaceId: 'ws-1',
    ...overrides,
  } as AgentNode;
}

function makeMessage(overrides: Partial<InboundMessage> = {}): InboundMessage {
  return {
    sourceNodeId: 'node-1',
    senderId: 'user-1',
    senderIsOwner: true,
    platform: 'telegram',
    groupId: null,
    content: 'Hello',
    contentType: 'text',
    forwardDepth: 0,
    ...overrides,
  } as InboundMessage;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeDeps(overrides: Record<string, unknown> = {}): any {
  return {
    getGraph: vi.fn(() => ({
      version: 2 as const,
      nodes: [makeNode()],
      edges: [],
      workspaces: [
        {
          id: 'ws-1',
          name: 'Engineering',
          color: '#333',
          purpose: 'Dev',
          topics: [],
          budget: { dailyLimitUsd: 5, preferCheap: false },
          position: { x: 0, y: 0 },
          size: { width: 400, height: 300 },
          checkpoints: [],
          groups: [],
        } as Workspace,
      ],
      globalInstructions: '',
      viewport: { x: 0, y: 0, zoom: 1 },
    })),
    agentMemory: {
      getOrCreateConversation: vi.fn(() => 'conv-1'),
      recordMessage: vi.fn(),
    },
    brain: null,
    kpiTracker: null,
    onActivity: vi.fn(),
    autonomy: {
      filterActions: vi.fn((_node: AgentNode, actions: readonly RoutingAction[]) => ({
        immediate: [...actions],
        pendingApproval: [] as RoutingAction[],
      })),
    },
    findNode: vi.fn((id: string) => (id === 'node-1' ? makeNode() : null)),
    findWorkspace: vi.fn(() => ({
      id: 'ws-1',
      name: 'Engineering',
      purpose: 'Dev',
      topics: [],
      groups: [],
    })),
    executeAction: vi.fn().mockResolvedValue(undefined),
    queuePendingApprovals: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('handleInbound', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns early when source node is not found', async () => {
    const deps = makeDeps({ findNode: vi.fn(() => null) });
    await handleInbound(makeMessage(), deps);
    expect(deps.onActivity).not.toHaveBeenCalled();
  });

  it('returns early when forward depth limit is reached', async () => {
    const deps = makeDeps();
    await handleInbound(makeMessage({ forwardDepth: 10 }), deps);
    expect(deps.executeAction).not.toHaveBeenCalled();
  });

  it('allows messages at depth below the limit', async () => {
    const deps = makeDeps();
    await handleInbound(makeMessage({ forwardDepth: 9 }), deps);
    expect(deps.onActivity).toHaveBeenCalled();
  });

  it('fires activity callbacks for active and idle', async () => {
    const deps = makeDeps();
    await handleInbound(makeMessage(), deps);
    expect(deps.onActivity).toHaveBeenCalledWith('activity:node', {
      nodeId: 'node-1',
      state: 'active',
    });
    expect(deps.onActivity).toHaveBeenCalledWith('activity:node', {
      nodeId: 'node-1',
      state: 'idle',
    });
  });

  it('records message in agent memory', async () => {
    const deps = makeDeps();
    await handleInbound(makeMessage(), deps);
    expect(deps.agentMemory.getOrCreateConversation).toHaveBeenCalledWith('telegram', null, [
      'node-1',
    ]);
    expect(deps.agentMemory.recordMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'conv-1',
        sourceNodeId: 'node-1',
        content: 'Hello',
      }),
    );
  });

  it('skips memory recording when agentMemory is null', async () => {
    const deps = makeDeps({ agentMemory: null });
    await handleInbound(makeMessage(), deps);
    // Should not throw
  });

  it('records KPI when tracker is present', async () => {
    const kpiTracker = { recordMessageHandled: vi.fn() };
    const deps = makeDeps({ kpiTracker });
    await handleInbound(makeMessage(), deps);
    expect(kpiTracker.recordMessageHandled).toHaveBeenCalledWith('node-1', expect.any(Number));
  });

  it('routes through code mode when enabled', async () => {
    const codeModeRouter = {
      route: vi.fn().mockResolvedValue([{ type: 'reply' as const, content: 'code output' }]),
    };
    const node = makeNode({ codeMode: { enabled: true, projectPath: '/tmp/project', permissionMode: 'auto' } });
    const deps = makeDeps({
      findNode: vi.fn(() => node),
      codeModeRouter,
    });
    await handleInbound(makeMessage(), deps);
    expect(codeModeRouter.route).toHaveBeenCalledWith(node, expect.any(Object));
  });

  it('invokes LLM routing when no rule actions and brain is present', async () => {
    const brain = {
      decideRouting: vi
        .fn()
        .mockResolvedValue({ actions: [{ type: 'reply', content: 'LLM says hi' }] }),
    };
    const deps = makeDeps({ brain });
    await handleInbound(makeMessage(), deps);
    expect(brain.decideRouting).toHaveBeenCalled();
  });

  it('invokes LLM routing for forwarded messages even when rule actions exist', async () => {
    const { evaluateEdgeRules } = await import('../routing.js');
    (evaluateEdgeRules as ReturnType<typeof vi.fn>).mockReturnValue([
      { type: 'reply', content: 'rule reply' },
    ]);

    const brain = {
      decideRouting: vi.fn().mockResolvedValue({ actions: [] }),
    };
    const deps = makeDeps({ brain });
    await handleInbound(makeMessage({ forwardDepth: 1 }), deps);
    expect(brain.decideRouting).toHaveBeenCalled();
  });

  it('skips LLM routing when rule actions exist and message is not forwarded', async () => {
    const { evaluateEdgeRules } = await import('../routing.js');
    (evaluateEdgeRules as ReturnType<typeof vi.fn>).mockReturnValue([
      { type: 'reply', content: 'rule reply' },
    ]);

    const brain = { decideRouting: vi.fn().mockResolvedValue({ actions: [] }) };
    const deps = makeDeps({ brain });
    await handleInbound(makeMessage({ forwardDepth: 0 }), deps);
    expect(brain.decideRouting).not.toHaveBeenCalled();
  });

  it('catches and logs LLM routing errors without throwing', async () => {
    const brain = {
      decideRouting: vi.fn().mockRejectedValue(new Error('LLM down')),
    };
    const deps = makeDeps({ brain });
    await expect(handleInbound(makeMessage(), deps)).resolves.toBeUndefined();
  });

  it('queues pending approvals from autonomy filtering', async () => {
    const { evaluateEdgeRules } = await import('../routing.js');
    (evaluateEdgeRules as ReturnType<typeof vi.fn>).mockReturnValue([
      { type: 'forward', targetNodeId: 'node-2', content: 'handle' },
    ]);

    const deps = makeDeps({
      autonomy: {
        filterActions: vi.fn(() => ({
          immediate: [],
          pendingApproval: [{ type: 'forward', targetNodeId: 'node-2', content: 'handle' }],
        })),
      },
    });

    await handleInbound(makeMessage(), deps);
    expect(deps.queuePendingApprovals).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'node-1' }),
      expect.arrayContaining([expect.objectContaining({ type: 'forward' })]),
    );
  });
});
