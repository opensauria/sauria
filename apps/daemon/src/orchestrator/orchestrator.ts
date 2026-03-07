import { persistCanvasGraph } from '../graph-persistence.js';
import type BetterSqlite3 from 'better-sqlite3';
import { nanoid } from 'nanoid';
import type {
  CanvasGraph,
  InboundMessage,
  RoutingAction,
  OwnerIdentity,
  OwnerCommand,
  Workspace,
  AgentNode,
  Platform,
} from './types.js';
import type { ChannelRegistry } from '../channels/registry.js';
import type { LLMRoutingBrain, RoutingContext } from './llm-router.js';
import type { AgentMemory } from './agent-memory.js';
import type { KPITracker } from './kpi-tracker.js';
import type { CheckpointManager } from './checkpoint.js';
import { AutonomyEnforcer } from './autonomy.js';
import { evaluateEdgeRules } from './routing.js';
import { getLogger } from '../utils/logger.js';
import { IPC_EVENTS } from '@sauria/ipc-protocol';
import type { ActivityMessagePayload } from '@sauria/ipc-protocol';
import type { IntegrationRegistry } from '../integrations/registry.js';
import { executeAction as executeActionImpl } from './action-executor.js';
import type { ActionContext } from './action-executor.js';
import { handleOwnerCommand as handleOwnerCommandImpl } from './owner-commands.js';
import type { OwnerCommandContext } from './owner-commands.js';
import { queuePendingApprovals } from './approval.js';
import type { ApprovalContext } from './approval.js';
import {
  isOwnerSender as isOwnerSenderImpl,
  findGroupForNode as findGroupForNodeFactory,
} from './orchestrator-helpers.js';
import type { HelperDeps } from './orchestrator-helpers.js';

const MAX_FORWARD_DEPTH = 3;

export type ActivityCallback = (event: string, data: Record<string, unknown>) => void;

interface OrchestratorDeps {
  readonly registry: ChannelRegistry;
  readonly graph: CanvasGraph;
  readonly ownerIdentity: OwnerIdentity;
  readonly brain?: LLMRoutingBrain;
  readonly db?: BetterSqlite3.Database;
  readonly agentMemory?: AgentMemory;
  readonly kpiTracker?: KPITracker;
  readonly checkpointManager?: CheckpointManager;
  readonly canvasPath?: string;
  readonly onActivity?: ActivityCallback;
  readonly integrationRegistry?: IntegrationRegistry;
}

export class AgentOrchestrator {
  private graph: CanvasGraph;
  private readonly registry: ChannelRegistry;
  private readonly ownerIdentity: OwnerIdentity;
  private readonly brain: LLMRoutingBrain | null;
  private readonly autonomy = new AutonomyEnforcer();
  private readonly db: BetterSqlite3.Database | null;
  private readonly agentMemory: AgentMemory | null;
  private readonly kpiTracker: KPITracker | null;
  private readonly checkpointManager: CheckpointManager | null;
  private readonly canvasPath: string | null;
  private readonly onActivity: ActivityCallback | null;
  private readonly integrationRegistry: IntegrationRegistry | null;

  constructor(deps: OrchestratorDeps) {
    this.registry = deps.registry;
    this.graph = deps.graph;
    this.ownerIdentity = deps.ownerIdentity;
    this.brain = deps.brain ?? null;
    this.db = deps.db ?? null;
    this.agentMemory = deps.agentMemory ?? null;
    this.kpiTracker = deps.kpiTracker ?? null;
    this.checkpointManager = deps.checkpointManager ?? null;
    this.canvasPath = deps.canvasPath ?? null;
    this.onActivity = deps.onActivity ?? null;
    this.integrationRegistry = deps.integrationRegistry ?? null;
  }

  updateGraph(newGraph: CanvasGraph): void {
    if (this.agentMemory) {
      const oldInstructions = new Map(this.graph.nodes.map((n) => [n.id, n.instructions]));
      for (const node of newGraph.nodes) {
        const prev = oldInstructions.get(node.id);
        if (prev !== undefined && prev !== node.instructions) {
          this.agentMemory.clearAgentConversations(node.id);
        }
      }
      if (this.graph.globalInstructions !== newGraph.globalInstructions) {
        for (const node of newGraph.nodes) {
          this.agentMemory.clearAgentConversations(node.id);
        }
      }
    }
    this.graph = newGraph;
    this.brain?.clearCache();
  }

  isOwnerSender(platform: Platform, senderId: string): boolean {
    return isOwnerSenderImpl(this.ownerIdentity, platform, senderId);
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
    const startTime = Date.now();
    const node = this.findNode(message.sourceNodeId);
    if (!node) return;

    if ((message.forwardDepth ?? 0) >= MAX_FORWARD_DEPTH) {
      logger.warn('Forward depth limit reached', {
        nodeId: message.sourceNodeId,
        depth: message.forwardDepth,
      });
      return;
    }

    this.onActivity?.(IPC_EVENTS.ACTIVITY_NODE, { nodeId: message.sourceNodeId, state: 'active' });

    let conversationId: string | null = null;
    if (this.agentMemory) {
      conversationId = this.agentMemory.getOrCreateConversation(message.platform, message.groupId, [
        message.sourceNodeId,
      ]);
      this.agentMemory.recordMessage({
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

    const ruleActions = evaluateEdgeRules(node, message, [...this.graph.edges]);

    if (ruleActions.length > 0) {
      const { immediate, pendingApproval } = this.autonomy.filterActions(node, ruleActions);
      for (const action of immediate) {
        await this.executeAction(action, message);
      }
      await this.queuePendingApprovals(node, pendingApproval);
    }

    const isForwarded = (message.forwardDepth ?? 0) > 0;
    if ((ruleActions.length === 0 || isForwarded) && this.brain) {
      const workspace = this.findWorkspace(node.id);
      const teamNodes = workspace
        ? this.graph.nodes.filter((n) => n.workspaceId === workspace.id)
        : [];

      const context: RoutingContext = {
        message,
        sourceNode: node,
        workspace,
        teamNodes,
        allNodes: this.graph.nodes,
        allWorkspaces: this.graph.workspaces,
        ruleActions,
        conversationId,
        globalInstructions: this.graph.globalInstructions,
        language: this.graph.language,
      };

      try {
        const decision = await this.brain.decideRouting(context);
        logger.info('LLM routing decision', {
          nodeId: node.id,
          actions: decision.actions.map((a) => a.type),
        });
        const { immediate, pendingApproval } = this.autonomy.filterActions(node, decision.actions);
        for (const action of immediate) {
          await this.executeAction(action, message);
        }
        await this.queuePendingApprovals(node, pendingApproval);
      } catch (error) {
        logger.error('LLM routing failed', {
          nodeId: node.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    this.onActivity?.(IPC_EVENTS.ACTIVITY_NODE, { nodeId: message.sourceNodeId, state: 'idle' });

    if (this.kpiTracker) {
      this.kpiTracker.recordMessageHandled(node.id, Date.now() - startTime);
    }
  }

  async handleOwnerCommand(command: OwnerCommand): Promise<void> {
    await handleOwnerCommandImpl(command, this.buildOwnerCommandContext());
  }

  async executeApprovedActions(agentId: string, actions: RoutingAction[]): Promise<number> {
    const node = this.findNode(agentId);
    const syntheticSource: InboundMessage = {
      sourceNodeId: agentId,
      platform: (node?.platform ?? 'telegram') as Platform,
      senderId: 'system-approval',
      senderIsOwner: true,
      groupId: null,
      content: '[Approved action]',
      contentType: 'text',
      timestamp: new Date().toISOString(),
    };

    let executed = 0;
    for (const action of actions) {
      await this.executeAction(action, syntheticSource);
      executed++;
    }
    return executed;
  }

  async executeAction(action: RoutingAction, source: InboundMessage): Promise<void> {
    await executeActionImpl(action, source, this.buildActionContext());
  }

  private resolveAgent(agentId: string): AgentNode | null {
    return (
      this.graph.nodes.find((n) => n.label.toLowerCase() === agentId.toLowerCase()) ??
      this.findNode(agentId)
    );
  }

  private updateNode(nodeId: string, patch: Partial<AgentNode>): void {
    this.graph = {
      ...this.graph,
      nodes: this.graph.nodes.map((n) => (n.id === nodeId ? { ...n, ...patch } : n)),
    };
  }

  private persistGraph(): void {
    if (!this.canvasPath) return;
    try {
      persistCanvasGraph(this.canvasPath, this.graph);
    } catch (error) {
      const logger = getLogger();
      logger.warn('Failed to persist canvas graph', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async queuePendingApprovals(
    node: AgentNode,
    pendingApproval: readonly RoutingAction[],
  ): Promise<void> {
    await queuePendingApprovals(
      node.id,
      node.workspaceId ?? undefined,
      pendingApproval,
      this.buildApprovalContext(),
    );
  }

  private buildHelperDeps(): HelperDeps {
    return {
      graph: this.graph,
      agentMemory: this.agentMemory,
      ownerIdentity: this.ownerIdentity,
      findNode: (nodeId: string) => this.findNode(nodeId),
    };
  }

  private buildActionContext(): ActionContext {
    const self = this;
    return {
      graph: this.graph,
      registry: this.registry,
      db: this.db,
      agentMemory: this.agentMemory,
      kpiTracker: this.kpiTracker,
      checkpointManager: this.checkpointManager,
      brain: this.brain,
      integrationRegistry: this.integrationRegistry,
      onActivity: this.onActivity,
      helperDeps: this.buildHelperDeps(),
      findNode: (nodeId: string) => self.findNode(nodeId),
      findWorkspace: (nodeId: string) => self.findWorkspace(nodeId),
      handleInbound: (msg: InboundMessage) => self.handleInbound(msg),
      emitMessage(from: string, to: string, content: string, actionType: string): void {
        const fromNode = self.findNode(from);
        const toNode = self.findNode(to);
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
        self.onActivity?.(IPC_EVENTS.ACTIVITY_MESSAGE, payload as unknown as Record<string, unknown>);
      },
      emitEdge(from: string, to: string, actionType: string, preview: string): void {
        self.onActivity?.(IPC_EVENTS.ACTIVITY_EDGE, { from, to, actionType, preview });
      },
    };
  }

  private buildApprovalContext(): ApprovalContext {
    return {
      checkpointManager: this.checkpointManager,
      registry: this.registry,
      ownerIdentity: this.ownerIdentity,
      getGraph: () => this.graph,
    };
  }

  private buildOwnerCommandContext(): OwnerCommandContext {
    const helperDeps = this.buildHelperDeps();
    return {
      getGraph: () => this.graph,
      setGraph: (g: CanvasGraph) => { this.graph = g; },
      registry: this.registry,
      kpiTracker: this.kpiTracker,
      ownerIdentity: this.ownerIdentity,
      resolveAgent: (agentId: string) => this.resolveAgent(agentId),
      updateNode: (nodeId: string, patch: Partial<AgentNode>) => this.updateNode(nodeId, patch),
      persistGraph: () => this.persistGraph(),
      findGroupForNode: findGroupForNodeFactory(helperDeps),
    };
  }
}
