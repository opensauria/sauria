import type BetterSqlite3 from 'better-sqlite3';
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
import type { LLMRoutingBrain } from './llm-router.js';
import type { AgentMemory } from './agent-memory.js';
import type { KPITracker } from './kpi-tracker.js';
import type { CheckpointManager } from './checkpoint.js';
import { AutonomyEnforcer } from './autonomy.js';
import type { IntegrationRegistry } from '../integrations/registry.js';
import { executeAction as executeActionImpl } from './action-executor.js';
import { handleOwnerCommand as handleOwnerCommandImpl } from './owner-commands.js';
import { queuePendingApprovals } from './approval.js';
import { isOwnerSender as isOwnerSenderImpl } from './orchestrator-helpers.js';
import type { OrchestratorState } from './orchestrator-context.js';
import {
  buildActionContext,
  buildApprovalContext,
  buildOwnerCommandContext,
  persistGraph,
} from './orchestrator-context.js';
import { handleInbound as handleInboundImpl } from './inbound-handler.js';

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
  private readonly state: OrchestratorState;
  private readonly autonomy = new AutonomyEnforcer();

  constructor(deps: OrchestratorDeps) {
    this.state = {
      graph: deps.graph,
      registry: deps.registry,
      ownerIdentity: deps.ownerIdentity,
      brain: deps.brain ?? null,
      db: deps.db ?? null,
      agentMemory: deps.agentMemory ?? null,
      kpiTracker: deps.kpiTracker ?? null,
      checkpointManager: deps.checkpointManager ?? null,
      canvasPath: deps.canvasPath ?? null,
      onActivity: deps.onActivity ?? null,
      integrationRegistry: deps.integrationRegistry ?? null,
    };
  }

  updateGraph(newGraph: CanvasGraph): void {
    if (this.state.agentMemory) {
      const oldInstructions = new Map(this.state.graph.nodes.map((n) => [n.id, n.instructions]));
      for (const node of newGraph.nodes) {
        const prev = oldInstructions.get(node.id);
        if (prev !== undefined && prev !== node.instructions) {
          this.state.agentMemory.clearAgentConversations(node.id);
        }
      }
      if (this.state.graph.globalInstructions !== newGraph.globalInstructions) {
        for (const node of newGraph.nodes) {
          this.state.agentMemory.clearAgentConversations(node.id);
        }
      }
    }
    this.state.graph = newGraph;
    this.state.brain?.clearCache();
  }

  isOwnerSender(platform: Platform, senderId: string): boolean {
    return isOwnerSenderImpl(this.state.ownerIdentity, platform, senderId);
  }

  findNode(nodeId: string): AgentNode | null {
    return this.state.graph.nodes.find((n) => n.id === nodeId) ?? null;
  }

  findWorkspace(nodeId: string): Workspace | null {
    const node = this.findNode(nodeId);
    if (!node?.workspaceId) return null;
    return this.state.graph.workspaces.find((w) => w.id === node.workspaceId) ?? null;
  }

  async handleInbound(message: InboundMessage): Promise<void> {
    await handleInboundImpl(message, {
      getGraph: () => this.state.graph,
      agentMemory: this.state.agentMemory,
      brain: this.state.brain,
      kpiTracker: this.state.kpiTracker,
      onActivity: this.state.onActivity,
      autonomy: this.autonomy,
      findNode: (nodeId) => this.findNode(nodeId),
      findWorkspace: (nodeId) => this.findWorkspace(nodeId),
      executeAction: (action, source) => this.executeAction(action, source),
      queuePendingApprovals: (node, actions) => this.queuePendingApprovals(node, actions),
    });
  }

  async handleOwnerCommand(command: OwnerCommand): Promise<void> {
    const ctx = buildOwnerCommandContext(
      this.state,
      (agentId) => this.resolveAgent(agentId),
      (nodeId, patch) => this.updateNode(nodeId, patch),
      () => persistGraph(this.state),
    );
    await handleOwnerCommandImpl(command, ctx);
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
    const ctx = buildActionContext(
      this.state,
      (nodeId) => this.findNode(nodeId),
      (nodeId) => this.findWorkspace(nodeId),
      (msg) => this.handleInbound(msg),
    );
    await executeActionImpl(action, source, ctx);
  }

  private resolveAgent(agentId: string): AgentNode | null {
    return (
      this.state.graph.nodes.find((n) => n.label.toLowerCase() === agentId.toLowerCase()) ??
      this.findNode(agentId)
    );
  }

  private updateNode(nodeId: string, patch: Partial<AgentNode>): void {
    this.state.graph = {
      ...this.state.graph,
      nodes: this.state.graph.nodes.map((n) => (n.id === nodeId ? { ...n, ...patch } : n)),
    };
  }

  private async queuePendingApprovals(
    node: AgentNode,
    pendingApproval: readonly RoutingAction[],
  ): Promise<void> {
    await queuePendingApprovals(
      node.id,
      node.workspaceId ?? undefined,
      pendingApproval,
      buildApprovalContext(this.state),
    );
  }
}
