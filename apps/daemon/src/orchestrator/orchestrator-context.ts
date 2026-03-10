import { nanoid } from 'nanoid';
import type BetterSqlite3 from 'better-sqlite3';
import type { CanvasGraph, InboundMessage, AgentNode } from './types.js';
import type { ChannelRegistry } from '../channels/registry.js';
import type { LLMRoutingBrain } from './llm-router.js';
import type { AgentMemory } from './agent-memory.js';
import type { KPITracker } from './kpi-tracker.js';
import type { CheckpointManager } from './checkpoint.js';
import type { IntegrationRegistry } from '../integrations/registry.js';
import type { CodeModeRouter } from './code-mode-router.js';
import type { ActionContext } from './action-executor.js';
import type { ApprovalContext } from './approval.js';
import type { OwnerCommandContext } from './owner-commands.js';
import type { HelperDeps } from './orchestrator-helpers.js';
import { findGroupForNode as findGroupForNodeFactory } from './orchestrator-helpers.js';
import { IPC_EVENTS } from '@sauria/ipc-protocol';
import type { ActivityMessagePayload } from '@sauria/ipc-protocol';
import type { OwnerIdentity, Workspace } from './types.js';
import { persistCanvasGraph } from '../graph-persistence.js';
import { getLogger } from '../utils/logger.js';
import type { ActivityCallback } from './orchestrator.js';

export interface OrchestratorState {
  graph: CanvasGraph;
  readonly registry: ChannelRegistry;
  readonly ownerIdentity: OwnerIdentity;
  readonly brain: LLMRoutingBrain | null;
  readonly db: BetterSqlite3.Database | null;
  readonly agentMemory: AgentMemory | null;
  readonly kpiTracker: KPITracker | null;
  readonly checkpointManager: CheckpointManager | null;
  readonly canvasPath: string | null;
  readonly onActivity: ActivityCallback | null;
  readonly integrationRegistry: IntegrationRegistry | null;
  readonly codeModeRouter: CodeModeRouter | null;
}

export function buildHelperDeps(state: OrchestratorState): HelperDeps {
  return {
    graph: state.graph,
    agentMemory: state.agentMemory,
    ownerIdentity: state.ownerIdentity,
    findNode: (nodeId: string) => state.graph.nodes.find((n) => n.id === nodeId) ?? null,
  };
}

export function buildActionContext(
  state: OrchestratorState,
  findNode: (nodeId: string) => AgentNode | null,
  findWorkspace: (nodeId: string) => Workspace | null,
  handleInbound: (msg: InboundMessage) => Promise<void>,
): ActionContext {
  return {
    graph: state.graph,
    registry: state.registry,
    db: state.db,
    agentMemory: state.agentMemory,
    kpiTracker: state.kpiTracker,
    checkpointManager: state.checkpointManager,
    brain: state.brain,
    integrationRegistry: state.integrationRegistry,
    onActivity: state.onActivity,
    helperDeps: buildHelperDeps(state),
    findNode,
    findWorkspace,
    handleInbound,
    emitMessage(from: string, to: string, content: string, actionType: string): void {
      const fromNode = findNode(from);
      const toNode = findNode(to);
      const payload: ActivityMessagePayload = {
        id: nanoid(),
        from,
        fromLabel: fromNode?.label ?? from,
        to,
        toLabel: toNode?.label ?? to,
        content,
        actionType,
        timestamp: new Date().toISOString(),
      };
      state.onActivity?.(
        IPC_EVENTS.ACTIVITY_MESSAGE,
        payload as unknown as Record<string, unknown>,
      );
    },
    emitEdge(from: string, to: string, actionType: string, preview: string): void {
      state.onActivity?.(IPC_EVENTS.ACTIVITY_EDGE, { from, to, actionType, preview });
    },
  };
}

export function buildApprovalContext(state: OrchestratorState): ApprovalContext {
  return {
    checkpointManager: state.checkpointManager,
    registry: state.registry,
    ownerIdentity: state.ownerIdentity,
    getGraph: () => state.graph,
  };
}

export function buildOwnerCommandContext(
  state: OrchestratorState,
  resolveAgent: (agentId: string) => AgentNode | null,
  updateNode: (nodeId: string, patch: Partial<AgentNode>) => void,
  persistGraph: () => void,
): OwnerCommandContext {
  const helperDeps = buildHelperDeps(state);
  return {
    getGraph: () => state.graph,
    setGraph: (g: CanvasGraph) => {
      state.graph = g;
    },
    registry: state.registry,
    kpiTracker: state.kpiTracker,
    ownerIdentity: state.ownerIdentity,
    resolveAgent,
    updateNode,
    persistGraph,
    findGroupForNode: findGroupForNodeFactory(helperDeps),
  };
}

export function persistGraph(state: OrchestratorState): void {
  if (!state.canvasPath) return;
  try {
    persistCanvasGraph(state.canvasPath, state.graph);
  } catch (error) {
    const logger = getLogger();
    logger.warn('Failed to persist canvas graph', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
