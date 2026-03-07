import type { RoutingAction } from './types.js';
import type { ChannelRegistry } from '../channels/registry.js';
import type { CheckpointManager } from './checkpoint.js';
import type { OwnerIdentity } from './types.js';
import { getLogger } from '../utils/logger.js';
import { isOwnerChannelNode } from './orchestrator-helpers.js';
import type { CanvasGraph } from './types.js';

export interface ApprovalContext {
  readonly checkpointManager: CheckpointManager | null;
  readonly registry: ChannelRegistry;
  readonly ownerIdentity: OwnerIdentity;
  getGraph(): CanvasGraph;
}

export async function queuePendingApprovals(
  nodeId: string,
  workspaceId: string | undefined,
  pendingApproval: readonly RoutingAction[],
  ctx: ApprovalContext,
): Promise<void> {
  if (pendingApproval.length === 0 || !ctx.checkpointManager) return;

  const logger = getLogger();
  const approvalId = ctx.checkpointManager.queueForApproval(
    nodeId,
    workspaceId ?? '',
    `${String(pendingApproval.length)} action(s) pending owner approval`,
    [...pendingApproval],
  );

  logger.info('Actions queued for approval', { approvalId, nodeId, count: pendingApproval.length });

  await notifyOwnerOfPendingApproval(approvalId, pendingApproval, ctx);
}

async function notifyOwnerOfPendingApproval(
  approvalId: string,
  actions: readonly RoutingAction[],
  ctx: ApprovalContext,
): Promise<void> {
  const summary = actions
    .map((a) => `- ${a.type}${'targetNodeId' in a ? ` → ${a.targetNodeId}` : ''}`)
    .join('\n');

  const message = `[Approval Required] ID: ${approvalId}\n${summary}`;
  const graph = ctx.getGraph();

  for (const node of graph.nodes) {
    if (node.platform === 'owner') continue;
    if (isOwnerChannelNode(ctx.ownerIdentity, node)) {
      try {
        await ctx.registry.sendTo(node.id, message, null);
        return;
      } catch {
        // Try next channel
      }
    }
  }
}
