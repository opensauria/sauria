import type BetterSqlite3 from 'better-sqlite3';
import { nanoid } from 'nanoid';
import type {
  CanvasGraph, InboundMessage, RoutingAction, CEOIdentity, CEOCommand,
  Workspace, AgentNode, Platform,
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
  readonly ceoIdentity: CEOIdentity;
  readonly brain?: LLMRoutingBrain;
  readonly db?: BetterSqlite3.Database;
  readonly agentMemory?: AgentMemory;
  readonly kpiTracker?: KPITracker;
  readonly checkpointManager?: CheckpointManager;
}

export class AgentOrchestrator {
  private graph: CanvasGraph;
  private readonly registry: ChannelRegistry;
  private readonly ceoIdentity: CEOIdentity;
  private readonly brain: LLMRoutingBrain | null;
  private readonly autonomy = new AutonomyEnforcer();
  private readonly db: BetterSqlite3.Database | null;
  private readonly agentMemory: AgentMemory | null;
  private readonly kpiTracker: KPITracker | null;
  private readonly checkpointManager: CheckpointManager | null;

  constructor(deps: OrchestratorDeps) {
    this.registry = deps.registry;
    this.graph = deps.graph;
    this.ceoIdentity = deps.ceoIdentity;
    this.brain = deps.brain ?? null;
    this.db = deps.db ?? null;
    this.agentMemory = deps.agentMemory ?? null;
    this.kpiTracker = deps.kpiTracker ?? null;
    this.checkpointManager = deps.checkpointManager ?? null;
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
    const startTime = Date.now();
    const node = this.findNode(message.sourceNodeId);
    if (!node) return;

    // Record inbound message in agent memory
    let conversationId: string | null = null;
    if (this.agentMemory) {
      conversationId = this.agentMemory.getOrCreateConversation(
        message.platform,
        message.groupId,
        [message.sourceNodeId],
      );
      this.agentMemory.recordMessage({
        conversationId,
        sourceNodeId: message.sourceNodeId,
        senderId: message.senderId,
        senderIsCeo: message.senderIsCeo,
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
        conversationId,
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

  async handleCeoCommand(command: CEOCommand): Promise<void> {
    const logger = getLogger();

    switch (command.type) {
      case 'instruct': {
        const node = this.findNodeByLabel(command.agentId) ?? this.findNode(command.agentId);
        if (!node) {
          logger.warn('CEO instruct: agent not found', { agentId: command.agentId });
          return;
        }
        const group = this.findGroupForNode(node.id);
        await this.registry.sendTo(node.id, command.instruction, group);
        logger.info('CEO instruct sent', { agentId: node.id });
        break;
      }

      case 'broadcast': {
        for (const ws of this.graph.workspaces) {
          await this.registry.sendToWorkspace(ws.id, command.message, this.graph);
        }
        logger.info('CEO broadcast sent', { workspaces: this.graph.workspaces.length });
        break;
      }

      case 'promote': {
        const node = this.findNodeByLabel(command.agentId) ?? this.findNode(command.agentId);
        if (!node) {
          logger.warn('CEO promote: agent not found', { agentId: command.agentId });
          return;
        }
        // Update node autonomy in the mutable graph copy
        const mutableNodes = [...this.graph.nodes] as AgentNode[];
        const idx = mutableNodes.findIndex((n) => n.id === node.id);
        if (idx >= 0) {
          mutableNodes[idx] = { ...node, autonomy: command.newAutonomy };
          this.graph = { ...this.graph, nodes: mutableNodes };
        }
        logger.info('CEO promote: autonomy updated', { agentId: node.id, autonomy: command.newAutonomy });
        break;
      }

      case 'reassign': {
        const node = this.findNodeByLabel(command.agentId) ?? this.findNode(command.agentId);
        if (!node) {
          logger.warn('CEO reassign: agent not found', { agentId: command.agentId });
          return;
        }
        const targetWs = this.graph.workspaces.find(
          (w) => w.id === command.newWorkspaceId || w.name === command.newWorkspaceId,
        );
        if (!targetWs) {
          logger.warn('CEO reassign: workspace not found', { workspaceId: command.newWorkspaceId });
          return;
        }
        const mutableNodes = [...this.graph.nodes] as AgentNode[];
        const idx = mutableNodes.findIndex((n) => n.id === node.id);
        if (idx >= 0) {
          mutableNodes[idx] = { ...node, workspaceId: targetWs.id };
          this.graph = { ...this.graph, nodes: mutableNodes };
        }
        logger.info('CEO reassign: node moved', { agentId: node.id, workspaceId: targetWs.id });
        break;
      }

      case 'pause': {
        const ws = this.graph.workspaces.find(
          (w) => w.id === command.workspaceId || w.name === command.workspaceId,
        );
        if (!ws) {
          logger.warn('CEO pause: workspace not found', { workspaceId: command.workspaceId });
          return;
        }
        const wsNodes = this.graph.nodes.filter((n) => n.workspaceId === ws.id);
        const mutableNodes = [...this.graph.nodes] as AgentNode[];
        for (const wsNode of wsNodes) {
          const idx = mutableNodes.findIndex((n) => n.id === wsNode.id);
          if (idx >= 0) {
            mutableNodes[idx] = { ...wsNode, status: 'disconnected' };
          }
          try {
            await this.registry.stop(wsNode.id);
          } catch {
            // Best-effort channel stop
          }
        }
        this.graph = { ...this.graph, nodes: mutableNodes };
        logger.info('CEO pause: workspace paused', { workspaceId: ws.id, nodeCount: wsNodes.length });
        break;
      }

      case 'review': {
        const node = this.findNodeByLabel(command.agentId) ?? this.findNode(command.agentId);
        if (!node) {
          logger.warn('CEO review: agent not found', { agentId: command.agentId });
          return;
        }
        let summary = `[Review] Agent: ${node.label} (${node.id})\nPlatform: ${node.platform}\nAutonomy: ${node.autonomy}\nRole: ${node.role}`;
        if (this.kpiTracker) {
          const perf = this.kpiTracker.getPerformance(node.id);
          summary += `\nMessages: ${String(perf.messagesHandled)}\nTasks: ${String(perf.tasksCompleted)}\nAvg Response: ${String(Math.round(perf.avgResponseTimeMs))}ms`;
        }
        // Send review to CEO's channel
        for (const n of this.graph.nodes) {
          if (this.isCeoChannelNode(n)) {
            try {
              await this.registry.sendTo(n.id, summary, null);
              break;
            } catch {
              // Try next
            }
          }
        }
        logger.info('CEO review sent', { agentId: node.id });
        break;
      }

      case 'hire': {
        logger.info('CEO hire: placeholder — requires canvas UI integration', {
          platform: command.platform,
          workspace: command.workspace,
          role: command.role,
        });
        break;
      }

      case 'fire': {
        const node = this.findNodeByLabel(command.agentId) ?? this.findNode(command.agentId);
        if (!node) {
          logger.warn('CEO fire: agent not found', { agentId: command.agentId });
          return;
        }
        try {
          await this.registry.stop(node.id);
          this.registry.unregister(node.id);
        } catch {
          // Best-effort
        }
        const mutableNodes = this.graph.nodes.filter((n) => n.id !== node.id);
        this.graph = { ...this.graph, nodes: mutableNodes };
        logger.info('CEO fire: agent removed', { agentId: node.id });
        break;
      }
    }
  }

  private findNodeByLabel(label: string): AgentNode | null {
    return this.graph.nodes.find(
      (n) => n.label.toLowerCase() === label.toLowerCase(),
    ) ?? null;
  }

  async executeApprovedActions(agentId: string, actions: RoutingAction[]): Promise<number> {
    const node = this.findNode(agentId);
    const syntheticSource: InboundMessage = {
      sourceNodeId: agentId,
      platform: (node?.platform ?? 'telegram') as Platform,
      senderId: 'system-approval',
      senderIsCeo: true,
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
      case 'assign': {
        if (this.db) {
          this.db
            .prepare(
              `INSERT INTO agent_tasks (id, workspace_id, assigned_to, delegated_by, title, priority)
               VALUES (?, ?, ?, ?, ?, ?)`,
            )
            .run(nanoid(), workspace?.id ?? '', action.targetNodeId, source.sourceNodeId, action.task, action.priority);
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
      `${String(pendingApproval.length)} action(s) pending CEO approval`,
      [...pendingApproval],
    );

    logger.info('Actions queued for approval', {
      approvalId,
      nodeId: node.id,
      count: pendingApproval.length,
    });

    await this.notifyCeoOfPendingApproval(approvalId, pendingApproval);
  }

  private async notifyCeoOfPendingApproval(
    approvalId: string,
    actions: readonly RoutingAction[],
  ): Promise<void> {
    const summary = actions
      .map((a) => `- ${a.type}${'targetNodeId' in a ? ` → ${a.targetNodeId}` : ''}`)
      .join('\n');

    const message = `[Approval Required] ID: ${approvalId}\n${summary}`;

    // Find a CEO-connected channel to send notification
    for (const node of this.graph.nodes) {
      if (node.platform === 'ceo') continue;
      const isCeoChannel = this.isCeoChannelNode(node);
      if (isCeoChannel) {
        try {
          await this.registry.sendTo(node.id, message, null);
          return;
        } catch {
          // Try next channel
        }
      }
    }
  }

  private isCeoChannelNode(node: AgentNode): boolean {
    if (node.platform === 'telegram' && this.ceoIdentity.telegram) return true;
    if (node.platform === 'slack' && this.ceoIdentity.slack) return true;
    if (node.platform === 'whatsapp' && this.ceoIdentity.whatsapp) return true;
    return false;
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
