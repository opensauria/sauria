import type BetterSqlite3 from 'better-sqlite3';
import type { AgentNode, CanvasGraph, InboundMessage, RoutingAction, Workspace } from './types.js';
import type { ChannelRegistry } from '../channels/registry.js';
import type { LLMRoutingBrain } from './llm-router.js';
import type { AgentMemory } from './agent-memory.js';
import type { KPITracker } from './kpi-tracker.js';
import type { CheckpointManager } from './checkpoint.js';
import type { IntegrationRegistry } from '../integrations/registry.js';
import type { ActivityCallback } from './orchestrator.js';
import type { HelperDeps } from './orchestrator-helpers.js';
import {
  handleForward,
  handleNotify,
  handleSendToAll,
  handleReply,
  handleGroupMessage,
  handleAssign,
  handleUseTool,
} from './action-handlers.js';

export interface ActionContext {
  readonly graph: CanvasGraph;
  readonly registry: ChannelRegistry;
  readonly db: BetterSqlite3.Database | null;
  readonly agentMemory: AgentMemory | null;
  readonly kpiTracker: KPITracker | null;
  readonly checkpointManager: CheckpointManager | null;
  readonly brain: LLMRoutingBrain | null;
  readonly integrationRegistry: IntegrationRegistry | null;
  readonly onActivity: ActivityCallback | null;
  readonly helperDeps: HelperDeps;
  findNode(nodeId: string): AgentNode | null;
  findWorkspace(nodeId: string): Workspace | null;
  handleInbound(message: InboundMessage): Promise<void>;
  emitMessage(from: string, to: string, content: string, actionType: string): void;
  emitEdge(from: string, to: string, actionType: string, preview: string): void;
}

export async function executeAction(
  action: RoutingAction,
  source: InboundMessage,
  ctx: ActionContext,
): Promise<void> {
  const workspace = ctx.findWorkspace(source.sourceNodeId);

  switch (action.type) {
    case 'forward': {
      await handleForward(action, source, ctx);
      break;
    }
    case 'notify': {
      await handleNotify(action, source, ctx);
      break;
    }
    case 'send_to_all': {
      await handleSendToAll(action, source, ctx);
      break;
    }
    case 'reply': {
      await handleReply(action, source, ctx);
      break;
    }
    case 'group_message': {
      await handleGroupMessage(action, source, ctx);
      break;
    }
    case 'assign': {
      handleAssign(action, source, ctx, workspace);
      break;
    }
    case 'learn': {
      if (ctx.agentMemory) {
        ctx.agentMemory.storeFact(
          source.sourceNodeId,
          workspace?.id ?? null,
          action.fact,
          [...action.topics],
          'orchestrator',
        );
      }
      break;
    }
    case 'checkpoint': {
      if (ctx.checkpointManager) {
        ctx.checkpointManager.queueForApproval(
          source.sourceNodeId,
          workspace?.id ?? '',
          action.description,
          [...action.pendingActions],
        );
      }
      break;
    }
    case 'use_tool': {
      await handleUseTool(action, source, ctx);
      break;
    }
  }
}
