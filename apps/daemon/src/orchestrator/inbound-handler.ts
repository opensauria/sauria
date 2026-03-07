import type { CanvasGraph, InboundMessage, RoutingAction, Workspace, AgentNode } from './types.js';
import type { LLMRoutingBrain, RoutingContext } from './llm-router.js';
import type { AgentMemory } from './agent-memory.js';
import type { KPITracker } from './kpi-tracker.js';
import { AutonomyEnforcer } from './autonomy.js';
import { evaluateEdgeRules } from './routing.js';
import { getLogger } from '../utils/logger.js';
import { IPC_EVENTS } from '@sauria/ipc-protocol';
import type { ActivityCallback } from './orchestrator.js';

const MAX_FORWARD_DEPTH = 3;

interface InboundDeps {
  readonly getGraph: () => CanvasGraph;
  readonly agentMemory: AgentMemory | null;
  readonly brain: LLMRoutingBrain | null;
  readonly kpiTracker: KPITracker | null;
  readonly onActivity: ActivityCallback | null;
  readonly autonomy: AutonomyEnforcer;
  readonly findNode: (nodeId: string) => AgentNode | null;
  readonly findWorkspace: (nodeId: string) => Workspace | null;
  readonly executeAction: (action: RoutingAction, source: InboundMessage) => Promise<void>;
  readonly queuePendingApprovals: (
    node: AgentNode,
    actions: readonly RoutingAction[],
  ) => Promise<void>;
}

export async function handleInbound(message: InboundMessage, deps: InboundDeps): Promise<void> {
  const logger = getLogger();
  const startTime = Date.now();
  const node = deps.findNode(message.sourceNodeId);
  if (!node) return;

  if ((message.forwardDepth ?? 0) >= MAX_FORWARD_DEPTH) {
    logger.warn('Forward depth limit reached', {
      nodeId: message.sourceNodeId,
      depth: message.forwardDepth,
    });
    return;
  }

  deps.onActivity?.(IPC_EVENTS.ACTIVITY_NODE, { nodeId: message.sourceNodeId, state: 'active' });

  let conversationId: string | null = null;
  if (deps.agentMemory) {
    conversationId = deps.agentMemory.getOrCreateConversation(message.platform, message.groupId, [
      message.sourceNodeId,
    ]);
    deps.agentMemory.recordMessage({
      conversationId,
      sourceNodeId: message.sourceNodeId,
      senderId: message.senderId,
      senderIsOwner: message.senderIsOwner,
      platform: message.platform,
      groupId: message.groupId,
      content: message.content,
      contentType: message.contentType,
    });
  }

  const ruleActions = evaluateEdgeRules(node, message, [...deps.getGraph().edges]);
  await processActions(node, ruleActions, message, deps);

  const isForwarded = (message.forwardDepth ?? 0) > 0;
  if ((ruleActions.length === 0 || isForwarded) && deps.brain) {
    await processLlmRouting(node, message, ruleActions, conversationId, deps);
  }

  deps.onActivity?.(IPC_EVENTS.ACTIVITY_NODE, { nodeId: message.sourceNodeId, state: 'idle' });

  if (deps.kpiTracker) {
    deps.kpiTracker.recordMessageHandled(node.id, Date.now() - startTime);
  }
}

async function processActions(
  node: AgentNode,
  actions: readonly RoutingAction[],
  message: InboundMessage,
  deps: InboundDeps,
): Promise<void> {
  if (actions.length === 0) return;
  const { immediate, pendingApproval } = deps.autonomy.filterActions(node, actions);
  for (const action of immediate) {
    await deps.executeAction(action, message);
  }
  await deps.queuePendingApprovals(node, pendingApproval);
}

async function processLlmRouting(
  node: AgentNode,
  message: InboundMessage,
  ruleActions: RoutingAction[],
  conversationId: string | null,
  deps: InboundDeps,
): Promise<void> {
  const logger = getLogger();
  const workspace = deps.findWorkspace(node.id);
  const graph = deps.getGraph();
  const teamNodes = workspace ? graph.nodes.filter((n) => n.workspaceId === workspace.id) : [];

  const context: RoutingContext = {
    message,
    sourceNode: node,
    workspace,
    teamNodes,
    allNodes: graph.nodes,
    allWorkspaces: graph.workspaces,
    ruleActions,
    conversationId,
    globalInstructions: graph.globalInstructions,
    language: graph.language,
  };

  try {
    const decision = await deps.brain!.decideRouting(context);
    logger.info('LLM routing decision', {
      nodeId: node.id,
      actions: decision.actions.map((a) => a.type),
    });
    await processActions(node, decision.actions, message, deps);
  } catch (error) {
    logger.error('LLM routing failed', {
      nodeId: node.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
