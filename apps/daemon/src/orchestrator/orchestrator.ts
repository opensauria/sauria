import { writeFileSync } from 'node:fs';
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
  }

  updateGraph(graph: CanvasGraph): void {
    this.graph = graph;
  }

  isOwnerSender(platform: Platform, senderId: string): boolean {
    if (platform === 'telegram' && this.ownerIdentity.telegram) {
      return String(this.ownerIdentity.telegram.userId) === senderId;
    }
    if (platform === 'slack' && this.ownerIdentity.slack) {
      return this.ownerIdentity.slack.userId === senderId;
    }
    if (platform === 'whatsapp' && this.ownerIdentity.whatsapp) {
      return this.ownerIdentity.whatsapp.phoneNumber === senderId;
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
    const startTime = Date.now();
    const node = this.findNode(message.sourceNodeId);
    if (!node) return;

    // Record inbound message in agent memory
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

    // Step 1: Evaluate deterministic edge rules
    const ruleActions = evaluateEdgeRules(node, message, [...this.graph.edges]);

    // Step 2: Execute rule-based actions (filtered by autonomy)
    if (ruleActions.length > 0) {
      const { immediate, pendingApproval } = this.autonomy.filterActions(node, ruleActions);
      for (const action of immediate) {
        await this.executeAction(action, message);
      }
      await this.queuePendingApprovals(node, pendingApproval);
    }

    // Step 3: If no rules matched, defer to LLM routing brain as fallback
    // The brain generates a direct reply even when no explicit LLM edges exist,
    // ensuring the orchestrator never silently drops messages.
    if (ruleActions.length === 0 && this.brain) {
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
        conversationId,
        globalInstructions: this.graph.globalInstructions,
      };

      try {
        const decision = await this.brain.decideRouting(context);
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

    // Track KPIs
    if (this.kpiTracker) {
      this.kpiTracker.recordMessageHandled(node.id, Date.now() - startTime);
    }
  }

  async handleOwnerCommand(command: OwnerCommand): Promise<void> {
    const logger = getLogger();
    let graphMutated = false;

    switch (command.type) {
      case 'instruct': {
        const node = this.resolveAgent(command.agentId);
        if (!node) {
          logger.warn('Owner instruct: agent not found', { agentId: command.agentId });
          return;
        }
        const group = this.findGroupForNode(node.id);
        await this.registry.sendTo(node.id, command.instruction, group);
        logger.info('Owner instruct sent', { agentId: node.id });
        break;
      }

      case 'broadcast': {
        for (const ws of this.graph.workspaces) {
          await this.registry.sendToWorkspace(ws.id, command.message, this.graph);
        }
        logger.info('Owner broadcast sent', { workspaces: this.graph.workspaces.length });
        break;
      }

      case 'promote': {
        const node = this.resolveAgent(command.agentId);
        if (!node) {
          logger.warn('Owner promote: agent not found', { agentId: command.agentId });
          return;
        }
        this.updateNode(node.id, { autonomy: command.newAutonomy });
        graphMutated = true;
        logger.info('Owner promote: autonomy updated', {
          agentId: node.id,
          autonomy: command.newAutonomy,
        });
        break;
      }

      case 'reassign': {
        const node = this.resolveAgent(command.agentId);
        if (!node) {
          logger.warn('Owner reassign: agent not found', { agentId: command.agentId });
          return;
        }
        const targetWs = this.graph.workspaces.find(
          (w) => w.id === command.newWorkspaceId || w.name === command.newWorkspaceId,
        );
        if (!targetWs) {
          logger.warn('Owner reassign: workspace not found', {
            workspaceId: command.newWorkspaceId,
          });
          return;
        }
        this.updateNode(node.id, { workspaceId: targetWs.id });
        graphMutated = true;
        logger.info('Owner reassign: node moved', { agentId: node.id, workspaceId: targetWs.id });
        break;
      }

      case 'pause': {
        const ws = this.graph.workspaces.find(
          (w) => w.id === command.workspaceId || w.name === command.workspaceId,
        );
        if (!ws) {
          logger.warn('Owner pause: workspace not found', { workspaceId: command.workspaceId });
          return;
        }
        const wsNodeIds = this.graph.nodes.filter((n) => n.workspaceId === ws.id).map((n) => n.id);
        this.graph = {
          ...this.graph,
          nodes: this.graph.nodes.map((n) =>
            wsNodeIds.includes(n.id) ? { ...n, status: 'disconnected' as const } : n,
          ),
        };
        graphMutated = true;
        for (const nodeId of wsNodeIds) {
          try {
            await this.registry.stop(nodeId);
          } catch {
            // Best-effort channel stop
          }
        }
        logger.info('Owner pause: workspace paused', {
          workspaceId: ws.id,
          nodeCount: wsNodeIds.length,
        });
        break;
      }

      case 'review': {
        const node = this.resolveAgent(command.agentId);
        if (!node) {
          logger.warn('Owner review: agent not found', { agentId: command.agentId });
          return;
        }
        let summary = `[Review] Agent: ${node.label} (${node.id})\nPlatform: ${node.platform}\nAutonomy: ${node.autonomy}\nRole: ${node.role}`;
        if (this.kpiTracker) {
          const perf = this.kpiTracker.getPerformance(node.id);
          summary += `\nMessages: ${String(perf.messagesHandled)}\nTasks: ${String(perf.tasksCompleted)}\nAvg Response: ${String(Math.round(perf.avgResponseTimeMs))}ms`;
        }
        for (const n of this.graph.nodes) {
          if (this.isOwnerChannelNode(n)) {
            try {
              await this.registry.sendTo(n.id, summary, null);
              break;
            } catch {
              // Try next
            }
          }
        }
        logger.info('Owner review sent', { agentId: node.id });
        break;
      }

      case 'hire': {
        logger.info('Owner hire: placeholder — requires canvas UI integration', {
          platform: command.platform,
          workspace: command.workspace,
          role: command.role,
        });
        break;
      }

      case 'fire': {
        const node = this.resolveAgent(command.agentId);
        if (!node) {
          logger.warn('Owner fire: agent not found', { agentId: command.agentId });
          return;
        }
        try {
          await this.registry.stop(node.id);
          this.registry.unregister(node.id);
        } catch {
          // Best-effort
        }
        this.graph = { ...this.graph, nodes: this.graph.nodes.filter((n) => n.id !== node.id) };
        graphMutated = true;
        logger.info('Owner fire: agent removed', { agentId: node.id });
        break;
      }
    }

    if (graphMutated) {
      this.persistGraph();
    }
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
      writeFileSync(this.canvasPath, JSON.stringify(this.graph, null, 2), 'utf-8');
    } catch (error) {
      const logger = getLogger();
      logger.warn('Failed to persist canvas graph', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
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
    const workspace = this.findWorkspace(source.sourceNodeId);

    switch (action.type) {
      case 'forward': {
        const group = this.findGroupForNode(action.targetNodeId);
        const contextPrefix = this.buildForwardContext(
          source.sourceNodeId,
          source.platform,
          source.groupId,
        );
        const enrichedContent = contextPrefix
          ? `${contextPrefix}\n${action.content}`
          : action.content;
        await this.registry.sendTo(action.targetNodeId, enrichedContent, group);
        break;
      }
      case 'notify': {
        const group = this.findGroupForNode(action.targetNodeId);
        const contextPrefix = this.buildForwardContext(
          source.sourceNodeId,
          source.platform,
          source.groupId,
        );
        const enrichedSummary = contextPrefix
          ? `${contextPrefix}\n${action.summary}`
          : action.summary;
        await this.registry.sendTo(action.targetNodeId, enrichedSummary, group);
        break;
      }
      case 'send_to_all': {
        await this.registry.sendToWorkspace(action.workspaceId, action.content, this.graph);
        break;
      }
      case 'reply': {
        await this.registry.sendTo(source.sourceNodeId, action.content, source.groupId);
        if (this.agentMemory) {
          const conversationId = this.agentMemory.getOrCreateConversation(
            source.platform,
            source.groupId,
            [source.sourceNodeId],
          );
          this.agentMemory.recordMessage({
            conversationId,
            sourceNodeId: source.sourceNodeId,
            senderId: source.sourceNodeId,
            senderIsOwner: false,
            platform: source.platform,
            groupId: source.groupId,
            content: action.content,
            contentType: 'text',
          });
        }
        break;
      }
      case 'group_message': {
        await this.registry.sendToWorkspace(action.workspaceId, action.content, this.graph);
        break;
      }
      case 'assign': {
        if (this.db) {
          this.db
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
        const group = this.findGroupForNode(action.targetNodeId);
        await this.registry.sendTo(action.targetNodeId, `[Task] ${action.task}`, group);
        if (this.kpiTracker) {
          this.kpiTracker.recordTaskCompleted(action.targetNodeId);
        }
        break;
      }
      case 'learn': {
        if (this.agentMemory) {
          this.agentMemory.storeFact(
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
        if (this.checkpointManager) {
          this.checkpointManager.queueForApproval(
            source.sourceNodeId,
            workspace?.id ?? '',
            action.description,
            [...action.pendingActions],
          );
        }
        break;
      }
    }
  }

  private async queuePendingApprovals(
    node: AgentNode,
    pendingApproval: readonly RoutingAction[],
  ): Promise<void> {
    if (pendingApproval.length === 0 || !this.checkpointManager) return;

    const logger = getLogger();
    const approvalId = this.checkpointManager.queueForApproval(
      node.id,
      node.workspaceId ?? '',
      `${String(pendingApproval.length)} action(s) pending owner approval`,
      [...pendingApproval],
    );

    logger.info('Actions queued for approval', {
      approvalId,
      nodeId: node.id,
      count: pendingApproval.length,
    });

    await this.notifyOwnerOfPendingApproval(approvalId, pendingApproval);
  }

  private async notifyOwnerOfPendingApproval(
    approvalId: string,
    actions: readonly RoutingAction[],
  ): Promise<void> {
    const summary = actions
      .map((a) => `- ${a.type}${'targetNodeId' in a ? ` → ${a.targetNodeId}` : ''}`)
      .join('\n');

    const message = `[Approval Required] ID: ${approvalId}\n${summary}`;

    // Find an owner-connected channel to send notification
    for (const node of this.graph.nodes) {
      if (node.platform === 'owner') continue;
      const isOwnerChannel = this.isOwnerChannelNode(node);
      if (isOwnerChannel) {
        try {
          await this.registry.sendTo(node.id, message, null);
          return;
        } catch {
          // Try next channel
        }
      }
    }
  }

  private isOwnerChannelNode(node: AgentNode): boolean {
    if (node.platform === 'telegram' && this.ownerIdentity.telegram) return true;
    if (node.platform === 'slack' && this.ownerIdentity.slack) return true;
    if (node.platform === 'whatsapp' && this.ownerIdentity.whatsapp) return true;
    return false;
  }

  private buildForwardContext(
    sourceNodeId: string,
    platform: string,
    groupId: string | null,
  ): string {
    if (!this.agentMemory) return '';

    const sourceNode = this.findNode(sourceNodeId);
    if (!sourceNode) return '';

    const conversationId = this.agentMemory.getOrCreateConversation(platform, groupId, [
      sourceNodeId,
    ]);

    const nodeLabels = new Map(this.graph.nodes.map((n) => [n.id, n.label]));
    const recentMessages = this.agentMemory.getRecentMessagesForContext(
      conversationId,
      5,
      nodeLabels,
    );

    if (recentMessages.length === 0) return '';

    return [
      `[Forwarded from ${sourceNode.label}]`,
      '[Recent context]:',
      ...recentMessages.map((m) => `- ${m}`),
      '',
      '[Message]:',
    ].join('\n');
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
