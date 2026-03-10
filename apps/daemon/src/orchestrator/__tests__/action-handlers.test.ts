import { describe, it, expect, vi } from 'vitest';
import {
  handleConclude,
  handleForward,
  handleNotify,
  handleSendToAll,
  handleGroupMessage,
  handleReply,
} from '../action-handlers.js';
import type { ActionContext } from '../action-executor.js';
import type { InboundMessage, AgentNode, CanvasGraph } from '../types.js';

vi.mock('../orchestrator-helpers.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../orchestrator-helpers.js')>();
  return {
    ...original,
    buildForwardContext: vi.fn().mockReturnValue(''),
  };
});

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
  } as AgentNode;
}

function makeSource(overrides: Partial<InboundMessage> = {}): InboundMessage {
  return {
    sourceNodeId: 'n1',
    platform: 'telegram',
    senderId: 'user1',
    senderIsOwner: true,
    groupId: null,
    content: 'hello',
    contentType: 'text',
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

function makeCtx(overrides: Partial<ActionContext> = {}): ActionContext {
  return {
    graph: {
      nodes: [makeNode(), makeNode({ id: 'n2', label: '@design_bot' })],
      edges: [],
      workspaces: [{ id: 'ws1', name: 'WS' }],
      globalInstructions: '',
    } as unknown as CanvasGraph,
    registry: {
      sendTo: vi.fn().mockResolvedValue(undefined),
    } as never,
    db: null,
    agentMemory: {
      getOrCreateConversation: vi.fn().mockReturnValue('conv-1'),
      recordMessage: vi.fn(),
    } as never,
    kpiTracker: null,
    checkpointManager: null,
    brain: null,
    integrationRegistry: null,
    onActivity: null,
    helperDeps: {
      graph: {
        nodes: [makeNode(), makeNode({ id: 'n2', label: '@design_bot' })],
        edges: [],
        workspaces: [],
        globalInstructions: '',
      } as unknown as CanvasGraph,
      agentMemory: null,
      ownerIdentity: {},
      findNode: (id: string) =>
        id === 'n1'
          ? makeNode()
          : id === 'n2'
            ? makeNode({ id: 'n2', label: '@design_bot' })
            : null,
    },
    findNode: (id: string) =>
      id === 'n1' ? makeNode() : id === 'n2' ? makeNode({ id: 'n2', label: '@design_bot' }) : null,
    findWorkspace: () => null,
    handleInbound: vi.fn().mockResolvedValue(undefined),
    emitMessage: vi.fn(),
    emitEdge: vi.fn(),
    ...overrides,
  };
}

describe('handleConclude', () => {
  it('sends reply via registry and emits edge+message', async () => {
    const ctx = makeCtx();
    const source = makeSource();

    await handleConclude({ type: 'conclude', content: 'Final answer' }, source, ctx);

    expect(ctx.registry.sendTo).toHaveBeenCalledWith('n1', 'Final answer', null);
    expect(ctx.emitEdge).toHaveBeenCalledWith('n1', 'n1', 'conclude', expect.any(String));
    expect(ctx.emitMessage).toHaveBeenCalledWith('n1', 'n1', 'Final answer', 'conclude');
  });

  it('sends to replyToNodeId when present', async () => {
    const ctx = makeCtx();
    const source = makeSource({ replyToNodeId: 'n2' });

    await handleConclude({ type: 'conclude', content: 'Done' }, source, ctx);

    expect(ctx.registry.sendTo).toHaveBeenCalledWith('n2', 'Done', null);
  });
});

describe('handleForward', () => {
  it('creates synthetic message and calls handleInbound', async () => {
    const ctx = makeCtx();
    const source = makeSource();

    await handleForward(
      { type: 'forward', targetNodeId: 'n2', content: 'Please handle' },
      source,
      ctx,
    );

    expect(ctx.handleInbound).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceNodeId: 'n2',
        senderId: 'n1',
        content: 'Please handle',
        senderIsOwner: false,
      }),
    );
    expect(ctx.emitEdge).toHaveBeenCalledWith('n1', 'n2', 'forward', expect.any(String));
  });

  it('increments forwardDepth', async () => {
    const ctx = makeCtx();
    const source = makeSource({ forwardDepth: 1 });

    await handleForward({ type: 'forward', targetNodeId: 'n2', content: 'fwd' }, source, ctx);

    const syntheticMsg = (ctx.handleInbound as ReturnType<typeof vi.fn>).mock
      .calls[0]![0] as InboundMessage;
    expect(syntheticMsg.forwardDepth).toBe(2);
  });

  it('enriches content when buildForwardContext returns context', async () => {
    const { buildForwardContext } = await import('../orchestrator-helpers.js');
    (buildForwardContext as ReturnType<typeof vi.fn>).mockReturnValueOnce('[Context]\n');

    const ctx = makeCtx();
    const source = makeSource();

    await handleForward(
      { type: 'forward', targetNodeId: 'n2', content: 'Please handle' },
      source,
      ctx,
    );

    const syntheticMsg = (ctx.handleInbound as ReturnType<typeof vi.fn>).mock
      .calls[0]![0] as InboundMessage;
    expect(syntheticMsg.content).toBe('[Context]\n\nPlease handle');
  });
});

describe('handleNotify', () => {
  it('creates synthetic message with summary and calls handleInbound', async () => {
    const ctx = makeCtx();
    const source = makeSource();

    await handleNotify({ type: 'notify', targetNodeId: 'n2', summary: 'FYI: update' }, source, ctx);

    expect(ctx.handleInbound).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceNodeId: 'n2',
        content: 'FYI: update',
      }),
    );
    expect(ctx.emitEdge).toHaveBeenCalledWith('n1', 'n2', 'notify', expect.any(String));
  });
});

describe('handleSendToAll', () => {
  it('broadcasts to all workspace nodes except sender', async () => {
    const ctx = makeCtx({
      graph: {
        nodes: [
          makeNode({ id: 'n1', workspaceId: 'ws1' }),
          makeNode({ id: 'n2', workspaceId: 'ws1' }),
          makeNode({ id: 'n3', workspaceId: 'ws2' }),
        ],
        edges: [],
        workspaces: [],
        globalInstructions: '',
      } as unknown as CanvasGraph,
    });
    const source = makeSource();

    await handleSendToAll(
      { type: 'send_to_all', workspaceId: 'ws1', content: 'Broadcast msg' },
      source,
      ctx,
    );

    expect(ctx.handleInbound).toHaveBeenCalledTimes(1);
    expect(ctx.handleInbound).toHaveBeenCalledWith(expect.objectContaining({ sourceNodeId: 'n2' }));
  });

  it('does nothing when no other nodes in workspace', async () => {
    const ctx = makeCtx({
      graph: {
        nodes: [makeNode({ id: 'n1', workspaceId: 'ws1' })],
        edges: [],
        workspaces: [],
        globalInstructions: '',
      } as unknown as CanvasGraph,
    });
    const source = makeSource();

    await handleSendToAll(
      { type: 'send_to_all', workspaceId: 'ws1', content: 'Hello' },
      source,
      ctx,
    );

    expect(ctx.handleInbound).not.toHaveBeenCalled();
  });
});

describe('handleGroupMessage', () => {
  it('broadcasts to workspace nodes except sender', async () => {
    const ctx = makeCtx({
      graph: {
        nodes: [
          makeNode({ id: 'n1', workspaceId: 'ws1' }),
          makeNode({ id: 'n2', workspaceId: 'ws1' }),
        ],
        edges: [],
        workspaces: [],
        globalInstructions: '',
      } as unknown as CanvasGraph,
    });
    const source = makeSource();

    await handleGroupMessage(
      { type: 'group_message', workspaceId: 'ws1', content: 'Group msg' },
      source,
      ctx,
    );

    expect(ctx.handleInbound).toHaveBeenCalledTimes(1);
    expect(ctx.emitEdge).toHaveBeenCalledWith('n1', 'n2', 'group_message', expect.any(String));
  });
});

describe('handleReply', () => {
  it('routes externally when forwardDepth is 0', async () => {
    const ctx = makeCtx();
    const source = makeSource({ forwardDepth: 0 });

    await handleReply({ type: 'reply', content: 'Hi back' }, source, ctx);

    expect(ctx.registry.sendTo).toHaveBeenCalledWith('n1', 'Hi back', null);
    expect(ctx.handleInbound).not.toHaveBeenCalled();
  });

  it('routes externally when forwardDepth is undefined', async () => {
    const ctx = makeCtx();
    const source = makeSource();

    await handleReply({ type: 'reply', content: 'Hi' }, source, ctx);

    expect(ctx.registry.sendTo).toHaveBeenCalledWith('n1', 'Hi', null);
  });

  it('routes internally when forwarded reply (forwardDepth > 0 and different replyToNodeId)', async () => {
    const ctx = makeCtx();
    const source = makeSource({
      sourceNodeId: 'n2',
      forwardDepth: 1,
      replyToNodeId: 'n1',
      senderId: 'n1',
      senderIsOwner: false,
    });

    await handleReply({ type: 'reply', content: 'Response' }, source, ctx);

    expect(ctx.registry.sendTo).not.toHaveBeenCalled();
    expect(ctx.handleInbound).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceNodeId: 'n1',
        senderId: 'n2',
        content: expect.stringContaining('[Reply from'),
      }),
    );
  });

  it('detects debate reply to owner and routes back to sender agent', async () => {
    const ctx = makeCtx();
    // Agent n1 receives a peer reply from n2 during a debate chain.
    // forwardDepth > 0, senderId !== sourceNodeId, senderIsOwner false,
    // but replyToNodeId === sourceNodeId (would normally go to owner).
    const source = makeSource({
      sourceNodeId: 'n1',
      senderId: 'n2',
      senderIsOwner: false,
      forwardDepth: 1,
      replyToNodeId: 'n1',
    });

    await handleReply({ type: 'reply', content: 'Debate response' }, source, ctx);

    // Should route internally to n2 (the sender), not externally to owner
    expect(ctx.registry.sendTo).not.toHaveBeenCalled();
    expect(ctx.handleInbound).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceNodeId: 'n2',
        senderId: 'n1',
      }),
    );
  });

  it('does not trigger debate guard when sender is owner', async () => {
    const ctx = makeCtx();
    const source = makeSource({
      sourceNodeId: 'n1',
      senderId: 'n2',
      senderIsOwner: true,
      forwardDepth: 1,
      replyToNodeId: 'n1',
    });

    await handleReply({ type: 'reply', content: 'Owner reply' }, source, ctx);

    // senderIsOwner = true, so debate guard should NOT activate
    expect(ctx.registry.sendTo).toHaveBeenCalledWith('n1', 'Owner reply', null);
  });

  it('includes groupId in external reply', async () => {
    const ctx = makeCtx();
    const source = makeSource({ groupId: 'grp-123' });

    await handleReply({ type: 'reply', content: 'In group' }, source, ctx);

    expect(ctx.registry.sendTo).toHaveBeenCalledWith('n1', 'In group', 'grp-123');
  });
});
