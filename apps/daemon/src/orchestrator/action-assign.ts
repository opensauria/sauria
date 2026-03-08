import { nanoid } from 'nanoid';
import type { InboundMessage, RoutingAction, Workspace } from './types.js';
import { contentPreview } from './orchestrator-helpers.js';
import type { ActionContext } from './action-executor.js';

export function handleAssign(
  action: Extract<RoutingAction, { readonly type: 'assign' }>,
  source: InboundMessage,
  ctx: ActionContext,
  workspace: Workspace | null,
): void {
  if (ctx.db) {
    ctx.db
      .prepare(
        `INSERT INTO agent_tasks (id, workspace_id, assigned_to, delegated_by, title, priority)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        nanoid(),
        workspace?.id ?? '',
        action.targetNodeId,
        source.sourceNodeId,
        action.task,
        action.priority,
      );
  }
  ctx.emitEdge(source.sourceNodeId, action.targetNodeId, 'assign', contentPreview(action.task));
  ctx.emitMessage(source.sourceNodeId, action.targetNodeId, action.task, 'assign');
  if (ctx.kpiTracker) {
    ctx.kpiTracker.recordTaskCompleted(action.targetNodeId);
  }
}
