import { describe, it, expect, vi, beforeEach } from 'vitest';
import { queuePendingApprovals } from '../approval.js';
import type { ApprovalContext } from '../approval.js';
import type { RoutingAction, AgentNode } from '../types.js';

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

function makeContext(overrides: Partial<ApprovalContext> = {}): ApprovalContext {
  return {
    checkpointManager: {
      queueForApproval: vi.fn(() => 'approval-123'),
    } as unknown as ApprovalContext['checkpointManager'],
    registry: {
      sendTo: vi.fn().mockResolvedValue(undefined),
    } as unknown as ApprovalContext['registry'],
    ownerIdentity: { telegram: { userId: 123 } },
    getGraph: vi.fn(() => ({
      nodes: [] as AgentNode[],
      edges: [],
      workspaces: [],
      globalInstructions: '',
    })),
    ...overrides,
  };
}

describe('queuePendingApprovals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does nothing when pending list is empty', async () => {
    const ctx = makeContext();
    await queuePendingApprovals('node-1', 'ws-1', [], ctx);
    expect(ctx.checkpointManager!.queueForApproval).not.toHaveBeenCalled();
  });

  it('does nothing when checkpoint manager is null', async () => {
    const ctx = makeContext({ checkpointManager: null });
    const actions: RoutingAction[] = [{ type: 'reply', content: 'Hello' }];
    await queuePendingApprovals('node-1', 'ws-1', actions, ctx);
    // No error thrown, no calls made
  });

  it('queues actions for approval with checkpoint manager', async () => {
    const ctx = makeContext();
    const actions: RoutingAction[] = [
      { type: 'forward', targetNodeId: 'node-2', content: 'Please help' },
    ];
    await queuePendingApprovals('node-1', 'ws-1', actions, ctx);
    expect(ctx.checkpointManager!.queueForApproval).toHaveBeenCalledWith(
      'node-1',
      'ws-1',
      '1 action(s) pending owner approval',
      expect.arrayContaining([expect.objectContaining({ type: 'forward' })]),
    );
  });

  it('uses empty string for undefined workspaceId', async () => {
    const ctx = makeContext();
    const actions: RoutingAction[] = [{ type: 'reply', content: 'Hello' }];
    await queuePendingApprovals('node-1', undefined, actions, ctx);
    expect(ctx.checkpointManager!.queueForApproval).toHaveBeenCalledWith(
      'node-1',
      '',
      expect.any(String),
      expect.any(Array),
    );
  });

  it('includes action count in approval description', async () => {
    const ctx = makeContext();
    const actions: RoutingAction[] = [
      { type: 'reply', content: 'A' },
      { type: 'reply', content: 'B' },
      { type: 'reply', content: 'C' },
    ];
    await queuePendingApprovals('node-1', 'ws-1', actions, ctx);
    expect(ctx.checkpointManager!.queueForApproval).toHaveBeenCalledWith(
      'node-1',
      'ws-1',
      '3 action(s) pending owner approval',
      expect.any(Array),
    );
  });

  it('attempts to notify owner via channel nodes', async () => {
    const { isOwnerChannelNode } = await import('../orchestrator-helpers.js');
    (isOwnerChannelNode as ReturnType<typeof vi.fn>).mockReturnValue(true);

    const ownerNode = {
      id: 'owner-node',
      label: '@owner',
      platform: 'telegram',
      role: 'specialist',
      autonomy: 'full',
      status: 'connected',
      workspaceId: 'ws-1',
    } as AgentNode;

    const ctx = makeContext({
      getGraph: vi.fn(() => ({
        nodes: [ownerNode],
        edges: [],
        workspaces: [],
        globalInstructions: '',
      })),
    });

    const actions: RoutingAction[] = [
      { type: 'forward', targetNodeId: 'node-2', content: 'Help' },
    ];
    await queuePendingApprovals('node-1', 'ws-1', actions, ctx);
    expect(ctx.registry.sendTo).toHaveBeenCalledWith(
      'owner-node',
      expect.stringContaining('Approval Required'),
      null,
    );
  });

  it('skips owner platform nodes in notification', async () => {
    const ownerPlatformNode = {
      id: 'owner-platform',
      label: 'Owner',
      platform: 'owner',
      role: 'owner',
      autonomy: 'full',
      status: 'connected',
      workspaceId: 'ws-1',
    } as AgentNode;

    const ctx = makeContext({
      getGraph: vi.fn(() => ({
        nodes: [ownerPlatformNode],
        edges: [],
        workspaces: [],
        globalInstructions: '',
      })),
    });

    const actions: RoutingAction[] = [{ type: 'reply', content: 'test' }];
    await queuePendingApprovals('node-1', 'ws-1', actions, ctx);
    expect(ctx.registry.sendTo).not.toHaveBeenCalled();
  });

  it('includes targetNodeId in approval summary for forward actions', async () => {
    const { isOwnerChannelNode } = await import('../orchestrator-helpers.js');
    (isOwnerChannelNode as ReturnType<typeof vi.fn>).mockReturnValue(true);

    const ctx = makeContext({
      getGraph: vi.fn(() => ({
        nodes: [
          {
            id: 'ch-1',
            label: '@ch',
            platform: 'telegram',
            role: 'specialist',
            autonomy: 'full',
            status: 'connected',
            workspaceId: 'ws-1',
          } as AgentNode,
        ],
        edges: [],
        workspaces: [],
        globalInstructions: '',
      })),
    });

    const actions: RoutingAction[] = [
      { type: 'forward', targetNodeId: 'node-2', content: 'Handle it' },
    ];
    await queuePendingApprovals('node-1', 'ws-1', actions, ctx);
    const sentMessage = (ctx.registry.sendTo as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as
      | string
      | undefined;
    expect(sentMessage).toContain('node-2');
  });
});
