import type {
  CanvasGraph, InboundMessage, RoutingAction, CEOIdentity,
  Workspace, AgentNode, Platform,
} from './types.js';
import type { ChannelRegistry } from '../channels/registry.js';
import type { LLMRoutingBrain, RoutingContext } from './llm-router.js';
import { AutonomyEnforcer } from './autonomy.js';
import { evaluateEdgeRules } from './routing.js';
import { getLogger } from '../utils/logger.js';

interface OrchestratorDeps {
  readonly registry: ChannelRegistry;
  readonly graph: CanvasGraph;
  readonly ceoIdentity: CEOIdentity;
  readonly brain?: LLMRoutingBrain;
}

export class AgentOrchestrator {
  private graph: CanvasGraph;
  private readonly registry: ChannelRegistry;
  private readonly ceoIdentity: CEOIdentity;
  private readonly brain: LLMRoutingBrain | null;
  private readonly autonomy = new AutonomyEnforcer();

  constructor(deps: OrchestratorDeps) {
    this.registry = deps.registry;
    this.graph = deps.graph;
    this.ceoIdentity = deps.ceoIdentity;
    this.brain = deps.brain ?? null;
  }

  updateGraph(graph: CanvasGraph): void {
    this.graph = graph;
  }

  isCeoSender(platform: Platform, senderId: string): boolean {
    if (platform === 'telegram' && this.ceoIdentity.telegram) {
      return String(this.ceoIdentity.telegram.userId) === senderId;
    }
    if (platform === 'slack' && this.ceoIdentity.slack) {
      return this.ceoIdentity.slack.userId === senderId;
    }
    if (platform === 'whatsapp' && this.ceoIdentity.whatsapp) {
      return this.ceoIdentity.whatsapp.phoneNumber === senderId;
    }
    return false;
  }

  findNode(nodeId: string): AgentNode | null {
    return this.graph.nodes.find((n) => n.id === nodeId) ?? null;
  }

  findWorkspace(nodeId: string): Workspace | null {
    const node = this.findNode(nodeId);
    if (!node?.workspaceId) return null;
    return this.graph.workspaces.find((w) => w.id === node.workspaceId) ?? null;
  }

  async handleInbound(message: InboundMessage): Promise<void> {
    const logger = getLogger();
    const node = this.findNode(message.sourceNodeId);
    if (!node) return;

    // Step 1: Evaluate deterministic edge rules
    const ruleActions = evaluateEdgeRules(node, message, [...this.graph.edges]);

    // Step 2: Execute rule-based actions (filtered by autonomy)
    if (ruleActions.length > 0) {
      const { immediate } = this.autonomy.filterActions(node, ruleActions);
      for (const action of immediate) {
        await this.executeAction(action, message);
      }
    }

    // Step 3: If no rules matched and LLM edges exist, defer to LLM routing
    const hasLlmEdges = this.graph.edges.some(
      (e) => e.from === node.id && e.rules.some((r) => r.type === 'llm_decided'),
    );

    if (hasLlmEdges && ruleActions.length === 0 && this.brain) {
      const workspace = this.findWorkspace(node.id);
      const teamNodes = workspace
        ? this.graph.nodes.filter((n) => n.workspaceId === workspace.id)
        : [];

      const context: RoutingContext = {
        message,
        sourceNode: node,
        workspace,
        teamNodes,
        ruleActions,
        conversationId: null,
      };

      try {
        const decision = await this.brain.decideRouting(context);
        const { immediate } = this.autonomy.filterActions(node, decision.actions);
        for (const action of immediate) {
          await this.executeAction(action, message);
        }
      } catch (error) {
        logger.error('LLM routing failed', {
          nodeId: node.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  async executeAction(action: RoutingAction, source: InboundMessage): Promise<void> {
    switch (action.type) {
      case 'forward': {
        const group = this.findGroupForNode(action.targetNodeId);
        await this.registry.sendTo(action.targetNodeId, action.content, group);
        break;
      }
      case 'notify': {
        const group = this.findGroupForNode(action.targetNodeId);
        await this.registry.sendTo(action.targetNodeId, action.summary, group);
        break;
      }
      case 'send_to_all': {
        await this.registry.sendToWorkspace(action.workspaceId, action.content, this.graph);
        break;
      }
      case 'reply': {
        await this.registry.sendTo(source.sourceNodeId, action.content, source.groupId);
        break;
      }
      case 'group_message': {
        await this.registry.sendToWorkspace(action.workspaceId, action.content, this.graph);
        break;
      }
      default:
        break;
    }
  }

  private findGroupForNode(nodeId: string): string | null {
    const node = this.findNode(nodeId);
    if (!node?.workspaceId) return null;
    const workspace = this.graph.workspaces.find((w) => w.id === node.workspaceId);
    if (!workspace) return null;
    const group = workspace.groups.find((g) => g.platform === node.platform);
    return group?.groupId ?? null;
  }
}
