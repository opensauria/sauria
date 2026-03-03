import type { AgentNode, RoutingAction, Workspace } from './types.js';

interface FilterResult {
  readonly immediate: RoutingAction[];
  readonly pendingApproval: RoutingAction[];
}

export class AutonomyEnforcer {
  filterActions(agent: AgentNode, actions: readonly RoutingAction[]): FilterResult {
    const { autonomy } = agent;

    if (autonomy === 'full' || autonomy === 'supervised') {
      return { immediate: [...actions], pendingApproval: [] };
    }

    if (autonomy === 'manual') {
      return { immediate: [], pendingApproval: [...actions] };
    }

    // autonomy === 'approval': reply is immediate, everything else pending
    const immediate: RoutingAction[] = [];
    const pendingApproval: RoutingAction[] = [];

    for (const action of actions) {
      if (action.type === 'reply' || action.type === 'escalate') {
        immediate.push(action);
      } else {
        pendingApproval.push(action);
      }
    }

    return { immediate, pendingApproval };
  }

  requiresCheckpoint(
    action: RoutingAction,
    sourceWorkspace: Workspace | null,
    targetWorkspace: Workspace | null,
  ): boolean {
    const checkpoints = sourceWorkspace?.checkpoints ?? [];

    for (const checkpoint of checkpoints) {
      if (
        checkpoint.condition === 'between_teams' &&
        this.isCrossWorkspace(action, sourceWorkspace, targetWorkspace)
      ) {
        return true;
      }

      if (checkpoint.condition === 'high_cost' && this.isHighCostAction(action, sourceWorkspace)) {
        return true;
      }

      if (checkpoint.condition === 'external_action' && this.isExternalAction(action)) {
        return true;
      }
    }

    return false;
  }

  private isCrossWorkspace(
    action: RoutingAction,
    sourceWorkspace: Workspace | null,
    targetWorkspace: Workspace | null,
  ): boolean {
    if (!sourceWorkspace || !targetWorkspace) {
      return false;
    }

    const hasTarget =
      action.type === 'forward' || action.type === 'assign' || action.type === 'notify';

    if (!hasTarget) {
      return false;
    }

    return sourceWorkspace.id !== targetWorkspace.id;
  }

  private isHighCostAction(action: RoutingAction, workspace: Workspace | null): boolean {
    if (!workspace?.models?.deep) {
      return false;
    }

    // Actions that would invoke reasoning — forward and assign trigger LLM processing
    return action.type === 'forward' || action.type === 'assign';
  }

  private isExternalAction(action: RoutingAction): boolean {
    return (
      action.type === 'send_to_all' || action.type === 'group_message' || action.type === 'forward'
    );
  }
}
