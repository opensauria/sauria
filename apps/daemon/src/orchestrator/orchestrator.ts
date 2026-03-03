import { writeFileSync } from 'node:fs';
import type BetterSqlite3 from 'better-sqlite3';
import { nanoid } from 'nanoid';
import type {
  CanvasGraph,
  InboundMessage,
  InternalRoute,
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
import type { EscalationManager } from './escalation.js';
import type { DelegationTracker } from './delegation-tracker.js';
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
  readonly escalationManager?: EscalationManager;
  readonly delegationTracker?: DelegationTracker;
  readonly enqueueInternal?: (message: InboundMessage) => void;
  readonly canvasPath?: string;
}

const MAX_INTERNAL_HOPS = 5;

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
  private readonly escalationManager: EscalationManager | null;
  private readonly delegationTracker: DelegationTracker | null;
  private readonly enqueueInternal: ((message: InboundMessage) => void) | null;
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
    this.escalationManager = deps.escalationManager ?? null;
    this.delegationTracker = deps.delegationTracker ?? null;
    this.enqueueInternal = deps.enqueueInternal ?? null;
    this.canvasPath = deps.canvasPath ?? null;
  }

  updateGraph(graph: CanvasGraph): void {
    this.graph = graph;
  }

  async sweepOverdueDelegations(): Promise<void> {
    if (!this.delegationTracker || !this.escalationManager || !this.agentMemory) return;

    const logger = getLogger();
    const overdue = this.delegationTracker.getOverdueTasks();

    for (const task of overdue) {
      const assignedNode = this.findNode(task.assignedTo);
      const label = assignedNode?.label ?? task.assignedTo;
      const summary = `Overdue task from ${label}: "${task.title}" (priority: ${task.priority}, deadline: ${task.deadline})`;

      logger.warn('Overdue delegation detected', {
        taskId: task.id,
        assignedTo: task.assignedTo,
        priority: task.priority,
      });

      const syntheticSource: InboundMessage = {
        sourceNodeId: task.assignedTo,
        platform: (assignedNode?.platform ?? 'internal') as Platform,
        senderId: 'system-sweep',
        senderIsOwner: false,
        groupId: null,
        content: summary,
        contentType: 'text',
        timestamp: new Date().toISOString(),
      };

      try {
        await this.executeAction({ type: 'escalate', summary }, syntheticSource);
      } catch {
        // Best-effort escalation to owner
      }

      this.delegationTracker.markCancelled(task.id);
    }
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

  private routeInternally(
    fromNodeId: string,
    targetNodeId: string,
    content: string,
    existingRoute?: InternalRoute,
  ): boolean {
    if (!this.enqueueInternal) return false;

    const targetNode = this.findNode(targetNodeId);
    if (!targetNode || targetNode.status !== 'connected') return false;

    const hopCount = existingRoute ? existingRoute.hopCount + 1 : 0;
    const dialogueId = existingRoute?.dialogueId ?? nanoid();
    const originNodeId = existingRoute?.originNodeId ?? fromNodeId;

    const internalMessage: InboundMessage = {
      sourceNodeId: targetNodeId,
      platform: 'internal',
      senderId: fromNodeId,
      senderIsOwner: false,
      groupId: dialogueId,
      content,
      contentType: 'text',
      timestamp: new Date().toISOString(),
      internalRoute: {
        originNodeId,
        fromNodeId,
        hopCount,
        dialogueId,
      },
    };

    this.enqueueInternal(internalMessage);
    return true;
  }

  async handleInbound(message: InboundMessage): Promise<void> {
    const logger = getLogger();
    const startTime = Date.now();
    const node = this.findNode(message.sourceNodeId);
    if (!node) return;

    logger.info('Inbound message received', {
      nodeId: node.id,
      label: node.label,
      platform: message.internalRoute ? 'internal' : message.platform,
      isInternal: !!message.internalRoute,
      fromNodeId: message.internalRoute?.fromNodeId,
      contentPreview: message.content.slice(0, 80),
    });

    // Hop limit for internal routing — prevents infinite loops
    if (message.internalRoute && message.internalRoute.hopCount >= MAX_INTERNAL_HOPS) {
      logger.warn('Internal routing hop limit reached', {
        dialogueId: message.internalRoute.dialogueId,
        hopCount: message.internalRoute.hopCount,
        fromNodeId: message.internalRoute.fromNodeId,
      });
      return;
    }

    // Owner reply routing: if owner replied and there's a pending escalation, route back
    if (message.senderIsOwner && this.escalationManager) {
      const pending =
        this.escalationManager.findPendingForChannel(message.sourceNodeId) ??
        this.escalationManager.findMostRecentPending();
      if (pending) {
        this.escalationManager.resolve(pending.id);
        const routed = this.routeInternally(
          message.sourceNodeId,
          pending.sourceNodeId,
          message.content,
          message.internalRoute,
        );
        if (!routed) {
          const group = this.findGroupForNode(pending.sourceNodeId);
          await this.registry.sendTo(pending.sourceNodeId, message.content, group);
        }
        if (this.agentMemory) {
          const convId = this.agentMemory.getOrCreateConversation(
            'internal',
            pending.conversationId,
            [pending.sourceNodeId],
          );
          this.agentMemory.recordMessage({
            conversationId: convId,
            sourceNodeId: message.sourceNodeId,
            senderId: message.senderId,
            senderIsOwner: true,
            platform: 'internal',
            groupId: pending.conversationId,
            content: message.content,
            contentType: 'text',
          });
        }
        return;
      }
    }

    // Record inbound message in agent memory
    let conversationId: string | null = null;
    if (this.agentMemory) {
      const workspace = this.findWorkspace(message.sourceNodeId);
      const platform = message.internalRoute ? 'internal' : message.platform;
      const groupId = message.internalRoute ? message.internalRoute.dialogueId : message.groupId;
      const participants = message.internalRoute
        ? [message.sourceNodeId, message.internalRoute.fromNodeId]
        : [message.sourceNodeId];
      conversationId = this.agentMemory.getOrCreateConversation(
        platform,
        groupId,
        participants,
        workspace?.id,
      );
      this.agentMemory.recordMessage({
        conversationId,
        sourceNodeId: message.sourceNodeId,
        senderId: message.senderId,
        senderIsOwner: message.senderIsOwner,
        platform,
        groupId,
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
        try {
          await this.executeAction(action, message);
        } catch (error) {
          logger.error('Rule action execution failed', {
            nodeId: node.id,
            actionType: action.type,
            error: error instanceof Error ? error.message : String(error),
          });
        }
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
        edges: [...this.graph.edges],
        ruleActions,
        conversationId,
        globalInstructions: this.graph.globalInstructions,
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

        try {
          const fallbackContent =
            'I encountered an issue processing your message. I have escalated this to the team lead.';
          if (message.internalRoute) {
            const isOrigin = message.internalRoute.originNodeId === message.sourceNodeId;
            if (isOrigin) {
              await this.registry.sendTo(message.sourceNodeId, fallbackContent, null);
            } else {
              const routed = this.routeInternally(
                message.sourceNodeId,
                message.internalRoute.fromNodeId,
                fallbackContent,
                message.internalRoute,
              );
              if (!routed) {
                await this.registry.sendTo(
                  message.internalRoute.fromNodeId,
                  fallbackContent,
                  this.findGroupForNode(message.internalRoute.fromNodeId),
                );
              }
            }
          } else {
            await this.registry.sendTo(message.sourceNodeId, fallbackContent, message.groupId);
          }
        } catch {
          // Best-effort fallback reply
        }

        if (!message.senderIsOwner && this.escalationManager && this.agentMemory) {
          try {
            const summary = `LLM routing failed for message from ${node.label}: ${message.content.slice(0, 200)}`;
            await this.executeAction({ type: 'escalate', summary }, message);
          } catch {
            // Best-effort escalation
          }
        }
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

    const logger = getLogger();
    let executed = 0;
    for (const action of actions) {
      try {
        await this.executeAction(action, syntheticSource);
        executed++;
      } catch (error) {
        logger.error('Approved action execution failed', {
          agentId,
          actionType: action.type,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return executed;
  }

  async executeAction(action: RoutingAction, source: InboundMessage): Promise<void> {
    const workspace = this.findWorkspace(source.sourceNodeId);

    switch (action.type) {
      case 'forward': {
        const contextPrefix = this.buildForwardContext(
          source.sourceNodeId,
          source.platform,
          source.groupId,
        );
        const enrichedContent = contextPrefix
          ? `${contextPrefix}\n${action.content}`
          : action.content;
        const routed = this.routeInternally(
          source.sourceNodeId,
          action.targetNodeId,
          enrichedContent,
          source.internalRoute,
        );
        if (!routed) {
          const group = this.findGroupForNode(action.targetNodeId);
          await this.registry.sendTo(action.targetNodeId, enrichedContent, group);
        }
        break;
      }
      case 'notify': {
        const contextPrefix = this.buildForwardContext(
          source.sourceNodeId,
          source.platform,
          source.groupId,
        );
        const enrichedSummary = contextPrefix
          ? `${contextPrefix}\n${action.summary}`
          : action.summary;
        const routed = this.routeInternally(
          source.sourceNodeId,
          action.targetNodeId,
          enrichedSummary,
          source.internalRoute,
        );
        if (!routed) {
          const group = this.findGroupForNode(action.targetNodeId);
          await this.registry.sendTo(action.targetNodeId, enrichedSummary, group);
        }
        break;
      }
      case 'send_to_all': {
        await this.registry.sendToWorkspace(action.workspaceId, action.content, this.graph);
        break;
      }
      case 'reply': {
        if (source.internalRoute) {
          const hasChannel = this.registry.get(source.sourceNodeId) !== null;
          if (hasChannel) {
            // Node has an external channel: reply to owner directly
            await this.registry.sendTo(source.sourceNodeId, action.content, null);
          } else {
            // No external channel: route reply back through the chain
            const routed = this.routeInternally(
              source.sourceNodeId,
              source.internalRoute.fromNodeId,
              action.content,
              source.internalRoute,
            );
            if (!routed) {
              const group = this.findGroupForNode(source.internalRoute.fromNodeId);
              await this.registry.sendTo(source.internalRoute.fromNodeId, action.content, group);
            }
          }
        } else {
          await this.registry.sendTo(source.sourceNodeId, action.content, source.groupId);
        }
        if (this.agentMemory) {
          const platform = source.internalRoute ? 'internal' : source.platform;
          const groupId = source.internalRoute ? source.internalRoute.dialogueId : source.groupId;
          const conversationId = this.agentMemory.getOrCreateConversation(platform, groupId, [
            source.sourceNodeId,
          ]);
          this.agentMemory.recordMessage({
            conversationId,
            sourceNodeId: source.sourceNodeId,
            senderId: source.sourceNodeId,
            senderIsOwner: false,
            platform,
            groupId,
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
        const taskId = nanoid();
        if (this.db) {
          this.db
            .prepare(
              `INSERT INTO agent_tasks (id, workspace_id, assigned_to, delegated_by, title, priority)
               VALUES (?, ?, ?, ?, ?, ?)`,
            )
            .run(
              taskId,
              workspace?.id ?? '',
              action.targetNodeId,
              source.sourceNodeId,
              action.task,
              action.priority,
            );
          if (this.delegationTracker) {
            this.delegationTracker.setDeadline(taskId, action.priority);
          }
        }
        const taskContent = `[Task] ${action.task}`;
        const routed = this.routeInternally(
          source.sourceNodeId,
          action.targetNodeId,
          taskContent,
          source.internalRoute,
        );
        if (!routed) {
          const group = this.findGroupForNode(action.targetNodeId);
          await this.registry.sendTo(action.targetNodeId, taskContent, group);
        }
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
      case 'escalate': {
        if (this.escalationManager && this.agentMemory) {
          const convId = this.agentMemory.getOrCreateConversation(source.platform, source.groupId, [
            source.sourceNodeId,
          ]);
          this.escalationManager.create(source.sourceNodeId, convId, action.summary);
        }
        const sourceNode = this.findNode(source.sourceNodeId);
        const label = sourceNode?.label ?? source.sourceNodeId;
        const ownerMessage = `[Escalation from ${label}] ${action.summary}`;
        for (const node of this.graph.nodes) {
          if (node.platform === 'owner') continue;
          if (this.isOwnerChannelNode(node)) {
            try {
              await this.registry.sendTo(node.id, ownerMessage, null);
              break;
            } catch {
              // Try next channel
            }
          }
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
