import { describe, it, expect, vi } from 'vitest';
import { executeAction } from '../action-executor.js';
import type { ActionContext } from '../action-executor.js';
import type { InboundMessage, AgentNode, CanvasGraph, RoutingAction, Workspace } from '../types.js';

vi.mock('../action-handlers.js', () => ({
  handleForward: vi.fn().mockResolvedValue(undefined),
  handleNotify: vi.fn().mockResolvedValue(undefined),
  handleSendToAll: vi.fn().mockResolvedValue(undefined),
  handleReply: vi.fn().mockResolvedValue(undefined),
  handleGroupMessage: vi.fn().mockResolvedValue(undefined),
  handleConclude: vi.fn().mockResolvedValue(undefined),
  handleUseTool: vi.fn().mockResolvedValue(undefined),
  handleAssign: vi.fn(),
}));

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
    graph: { nodes: [], edges: [], workspaces: [], globalInstructions: '' } as unknown as CanvasGraph,
    registry: { sendTo: vi.fn() } as never,
    db: null,
    agentMemory: null,
    kpiTracker: null,
    checkpointManager: null,
    brain: null,
    integrationRegistry: null,
    onActivity: null,
    helperDeps: { graph: {} as CanvasGraph, agentMemory: null, ownerIdentity: {}, findNode: () => null },
    findNode: () => null,
    findWorkspace: () => null,
    handleInbound: vi.fn().mockResolvedValue(undefined),
    emitMessage: vi.fn(),
    emitEdge: vi.fn(),
    ...overrides,
  };
}

describe('executeAction', () => {
  it('dispatches forward action', async () => {
    const { handleForward } = await import('../action-handlers.js');
    const ctx = makeCtx();
    const source = makeSource();
    const action: RoutingAction = { type: 'forward', targetNodeId: 'n2', content: 'fwd' };

    await executeAction(action, source, ctx);

    expect(handleForward).toHaveBeenCalledWith(action, source, ctx);
  });

  it('dispatches notify action', async () => {
    const { handleNotify } = await import('../action-handlers.js');
    const ctx = makeCtx();
    const source = makeSource();
    const action: RoutingAction = { type: 'notify', targetNodeId: 'n2', summary: 'update' };

    await executeAction(action, source, ctx);

    expect(handleNotify).toHaveBeenCalledWith(action, source, ctx);
  });

  it('dispatches reply action', async () => {
    const { handleReply } = await import('../action-handlers.js');
    const ctx = makeCtx();
    const source = makeSource();
    const action: RoutingAction = { type: 'reply', content: 'hi' };

    await executeAction(action, source, ctx);

    expect(handleReply).toHaveBeenCalledWith(action, source, ctx);
  });

  it('dispatches send_to_all action', async () => {
    const { handleSendToAll } = await import('../action-handlers.js');
    const ctx = makeCtx();
    const source = makeSource();
    const action: RoutingAction = { type: 'send_to_all', workspaceId: 'ws1', content: 'all' };

    await executeAction(action, source, ctx);

    expect(handleSendToAll).toHaveBeenCalledWith(action, source, ctx);
  });

  it('dispatches group_message action', async () => {
    const { handleGroupMessage } = await import('../action-handlers.js');
    const ctx = makeCtx();
    const source = makeSource();
    const action: RoutingAction = { type: 'group_message', workspaceId: 'ws1', content: 'grp' };

    await executeAction(action, source, ctx);

    expect(handleGroupMessage).toHaveBeenCalledWith(action, source, ctx);
  });

  it('dispatches conclude action', async () => {
    const { handleConclude } = await import('../action-handlers.js');
    const ctx = makeCtx();
    const source = makeSource();
    const action: RoutingAction = { type: 'conclude', content: 'done' };

    await executeAction(action, source, ctx);

    expect(handleConclude).toHaveBeenCalledWith(action, source, ctx);
  });

  it('dispatches use_tool action', async () => {
    const { handleUseTool } = await import('../action-handlers.js');
    const ctx = makeCtx();
    const source = makeSource();
    const action: RoutingAction = { type: 'use_tool', instanceId: 'inst-1', tool: 'search', input: {} };

    await executeAction(action, source, ctx);

    expect(handleUseTool).toHaveBeenCalledWith(action, source, ctx);
  });

  it('dispatches assign action with workspace', async () => {
    const { handleAssign } = await import('../action-handlers.js');
    const workspace = { id: 'ws1', name: 'WS' } as Workspace;
    const ctx = makeCtx({ findWorkspace: () => workspace });
    const source = makeSource();
    const action: RoutingAction = { type: 'assign', targetNodeId: 'n2', task: 'do it', priority: 'medium' };

    await executeAction(action, source, ctx);

    expect(handleAssign).toHaveBeenCalledWith(action, source, ctx, workspace);
  });

  it('handles learn action with agentMemory', async () => {
    const storeFact = vi.fn();
    const workspace = { id: 'ws1' } as Workspace;
    const ctx = makeCtx({
      agentMemory: { storeFact } as never,
      findWorkspace: () => workspace,
    });
    const source = makeSource();
    const action: RoutingAction = { type: 'learn', fact: 'important info', topics: ['topic1'] };

    await executeAction(action, source, ctx);

    expect(storeFact).toHaveBeenCalledWith('n1', 'ws1', 'important info', ['topic1'], 'orchestrator');
  });

  it('skips learn action when agentMemory is null', async () => {
    const ctx = makeCtx({ agentMemory: null });
    const source = makeSource();
    const action: RoutingAction = { type: 'learn', fact: 'info', topics: [] };

    await executeAction(action, source, ctx);
    // Should not throw
  });

  it('handles learn action with null workspace', async () => {
    const storeFact = vi.fn();
    const ctx = makeCtx({
      agentMemory: { storeFact } as never,
      findWorkspace: () => null,
    });
    const source = makeSource();
    const action: RoutingAction = { type: 'learn', fact: 'info', topics: ['t'] };

    await executeAction(action, source, ctx);

    expect(storeFact).toHaveBeenCalledWith('n1', null, 'info', ['t'], 'orchestrator');
  });

  it('handles checkpoint action with checkpointManager', async () => {
    const queueForApproval = vi.fn();
    const workspace = { id: 'ws1' } as Workspace;
    const ctx = makeCtx({
      checkpointManager: { queueForApproval } as never,
      findWorkspace: () => workspace,
    });
    const source = makeSource();
    const action: RoutingAction = {
      type: 'checkpoint',
      description: 'Need approval',
      pendingActions: [{ type: 'reply', content: 'pending' }],
    };

    await executeAction(action, source, ctx);

    expect(queueForApproval).toHaveBeenCalledWith(
      'n1',
      'ws1',
      'Need approval',
      [{ type: 'reply', content: 'pending' }],
    );
  });

  it('skips checkpoint action when checkpointManager is null', async () => {
    const ctx = makeCtx({ checkpointManager: null });
    const source = makeSource();
    const action: RoutingAction = {
      type: 'checkpoint',
      description: 'Need approval',
      pendingActions: [],
    };

    await executeAction(action, source, ctx);
    // Should not throw
  });

  it('uses empty string for workspace id in checkpoint when workspace is null', async () => {
    const queueForApproval = vi.fn();
    const ctx = makeCtx({
      checkpointManager: { queueForApproval } as never,
      findWorkspace: () => null,
    });
    const source = makeSource();
    const action: RoutingAction = {
      type: 'checkpoint',
      description: 'desc',
      pendingActions: [],
    };

    await executeAction(action, source, ctx);

    expect(queueForApproval).toHaveBeenCalledWith('n1', '', 'desc', []);
  });
});
