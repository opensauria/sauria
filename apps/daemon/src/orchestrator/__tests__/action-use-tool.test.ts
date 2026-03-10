import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleUseTool } from '../action-use-tool.js';
import type { InboundMessage, RoutingAction } from '../types.js';
import type { ActionContext } from '../action-executor.js';

vi.mock('../../utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('../orchestrator-helpers.js', () => ({
  resolveInstanceId: vi.fn(),
}));

vi.mock('../action-executor.js', () => ({
  executeAction: vi.fn().mockResolvedValue(undefined),
}));

function makeAction(
  overrides?: Partial<Extract<RoutingAction, { readonly type: 'use_tool' }>>,
): Extract<RoutingAction, { readonly type: 'use_tool' }> {
  return {
    type: 'use_tool',
    integration: 'linear:default',
    tool: 'create_issue',
    arguments: { title: 'Test' },
    content: 'Creating issue',
    ...overrides,
  } as Extract<RoutingAction, { readonly type: 'use_tool' }>;
}

function makeSource(overrides?: Partial<InboundMessage>): InboundMessage {
  return {
    sourceNodeId: 'node-1',
    platform: 'telegram',
    senderId: 'user-1',
    senderIsOwner: true,
    groupId: null,
    content: 'Create an issue',
    contentType: 'text',
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

function makeCtx(overrides?: Partial<ActionContext>): ActionContext {
  return {
    graph: {
      nodes: [],
      edges: [],
      workspaces: [],
      globalInstructions: '',
      version: 2,
      viewport: { x: 0, y: 0, zoom: 1 },
    },
    registry: {} as never,
    db: null,
    agentMemory: null,
    kpiTracker: null,
    checkpointManager: null,
    brain: null,
    integrationRegistry: null,
    onActivity: null,
    helperDeps: {} as never,
    findNode: vi.fn().mockReturnValue(null),
    findWorkspace: vi.fn().mockReturnValue(null),
    handleInbound: vi.fn(),
    emitMessage: vi.fn(),
    emitEdge: vi.fn(),
    ...overrides,
  };
}

describe('handleUseTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns early when integrationRegistry is null', async () => {
    const ctx = makeCtx({ integrationRegistry: null });
    await handleUseTool(makeAction(), makeSource(), ctx);

    const { executeAction } = await import('../action-executor.js');
    expect(executeAction).not.toHaveBeenCalled();
  });

  it('calls integrationRegistry.callTool on success', async () => {
    const callTool = vi.fn().mockResolvedValue('tool result');
    const ctx = makeCtx({
      integrationRegistry: { callTool } as never,
    });

    await handleUseTool(makeAction(), makeSource(), ctx);

    expect(callTool).toHaveBeenCalledWith('linear:default', 'create_issue', { title: 'Test' });
  });

  it('uses brain.summarizeToolResult when brain is available', async () => {
    const callTool = vi.fn().mockResolvedValue('raw result');
    const summarizeToolResult = vi.fn().mockResolvedValue('summarized');
    const ctx = makeCtx({
      integrationRegistry: { callTool } as never,
      brain: { summarizeToolResult } as never,
      findNode: vi.fn().mockReturnValue({ label: 'TestBot' }),
    });

    await handleUseTool(makeAction(), makeSource(), ctx);

    expect(summarizeToolResult).toHaveBeenCalledWith(
      'TestBot',
      'Create an issue',
      'create_issue',
      expect.any(String),
    );
  });

  it('falls back to content + raw result when brain is null', async () => {
    const callTool = vi.fn().mockResolvedValue('raw result');
    const ctx = makeCtx({
      integrationRegistry: { callTool } as never,
      brain: null,
    });

    await handleUseTool(makeAction(), makeSource(), ctx);

    const { executeAction } = await import('../action-executor.js');
    expect(executeAction).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'reply',
        content: expect.stringContaining('raw result'),
      }),
      expect.anything(),
      expect.anything(),
    );
  });

  it('replies with error message when callTool throws', async () => {
    const callTool = vi.fn().mockRejectedValue(new Error('API error'));
    const ctx = makeCtx({
      integrationRegistry: { callTool } as never,
    });

    await handleUseTool(makeAction(), makeSource(), ctx);

    const { executeAction } = await import('../action-executor.js');
    expect(executeAction).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'reply',
        content: expect.stringContaining('API error'),
      }),
      expect.anything(),
      expect.anything(),
    );
  });

  it('blocks use_tool when instance is not assigned to agent', async () => {
    const { resolveInstanceId } = await import('../orchestrator-helpers.js');
    (resolveInstanceId as ReturnType<typeof vi.fn>).mockReturnValue(null);

    const ctx = makeCtx({
      integrationRegistry: { callTool: vi.fn() } as never,
      findNode: vi.fn().mockReturnValue({
        id: 'node-1',
        integrations: ['other:default'],
      }),
    });

    await handleUseTool(makeAction(), makeSource(), ctx);

    const { executeAction } = await import('../action-executor.js');
    expect(executeAction).not.toHaveBeenCalled();
  });

  it('resolves integration via resolveInstanceId when node has integrations', async () => {
    const { resolveInstanceId } = await import('../orchestrator-helpers.js');
    (resolveInstanceId as ReturnType<typeof vi.fn>).mockReturnValue('linear:custom');

    const callTool = vi.fn().mockResolvedValue('ok');
    const ctx = makeCtx({
      integrationRegistry: { callTool } as never,
      findNode: vi.fn().mockReturnValue({
        id: 'node-1',
        integrations: ['linear:custom'],
      }),
    });

    await handleUseTool(makeAction(), makeSource(), ctx);

    expect(callTool).toHaveBeenCalledWith('linear:custom', 'create_issue', { title: 'Test' });
  });

  it('handles non-string tool results by JSON.stringifying', async () => {
    const callTool = vi.fn().mockResolvedValue({ key: 'value' });
    const ctx = makeCtx({
      integrationRegistry: { callTool } as never,
    });

    await handleUseTool(makeAction(), makeSource(), ctx);

    const { executeAction } = await import('../action-executor.js');
    expect(executeAction).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('{"key":"value"}'),
      }),
      expect.anything(),
      expect.anything(),
    );
  });
});
