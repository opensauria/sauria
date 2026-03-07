import type {
  AgentNode,
  CanvasGraph,
  OwnerCommand,
} from './types.js';
import type { ChannelRegistry } from '../channels/registry.js';
import type { KPITracker } from './kpi-tracker.js';
import type { OwnerIdentity } from './types.js';
import { getLogger } from '../utils/logger.js';
import { isOwnerChannelNode } from './orchestrator-helpers.js';

export interface OwnerCommandContext {
  getGraph(): CanvasGraph;
  setGraph(graph: CanvasGraph): void;
  readonly registry: ChannelRegistry;
  readonly kpiTracker: KPITracker | null;
  readonly ownerIdentity: OwnerIdentity;
  resolveAgent(agentId: string): AgentNode | null;
  updateNode(nodeId: string, patch: Partial<AgentNode>): void;
  persistGraph(): void;
  findGroupForNode(nodeId: string): string | null;
}

export async function handleOwnerCommand(
  command: OwnerCommand,
  ctx: OwnerCommandContext,
): Promise<void> {
  const logger = getLogger();
  let graphMutated = false;

  switch (command.type) {
    case 'instruct': {
      const node = ctx.resolveAgent(command.agentId);
      if (!node) {
        logger.warn('Owner instruct: agent not found', { agentId: command.agentId });
        return;
      }
      const group = ctx.findGroupForNode(node.id);
      await ctx.registry.sendTo(node.id, command.instruction, group);
      logger.info('Owner instruct sent', { agentId: node.id });
      break;
    }

    case 'broadcast': {
      const graph = ctx.getGraph();
      for (const ws of graph.workspaces) {
        await ctx.registry.sendToWorkspace(ws.id, command.message, graph);
      }
      logger.info('Owner broadcast sent', { workspaces: graph.workspaces.length });
      break;
    }

    case 'promote': {
      const node = ctx.resolveAgent(command.agentId);
      if (!node) {
        logger.warn('Owner promote: agent not found', { agentId: command.agentId });
        return;
      }
      ctx.updateNode(node.id, { autonomy: command.newAutonomy });
      graphMutated = true;
      logger.info('Owner promote: autonomy updated', {
        agentId: node.id,
        autonomy: command.newAutonomy,
      });
      break;
    }

    case 'reassign': {
      const node = ctx.resolveAgent(command.agentId);
      if (!node) {
        logger.warn('Owner reassign: agent not found', { agentId: command.agentId });
        return;
      }
      const graph = ctx.getGraph();
      const targetWs = graph.workspaces.find(
        (w) => w.id === command.newWorkspaceId || w.name === command.newWorkspaceId,
      );
      if (!targetWs) {
        logger.warn('Owner reassign: workspace not found', {
          workspaceId: command.newWorkspaceId,
        });
        return;
      }
      ctx.updateNode(node.id, { workspaceId: targetWs.id });
      graphMutated = true;
      logger.info('Owner reassign: node moved', { agentId: node.id, workspaceId: targetWs.id });
      break;
    }

    case 'pause': {
      graphMutated = await handlePause(command, ctx);
      break;
    }

    case 'review': {
      await handleReview(command, ctx);
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
      const node = ctx.resolveAgent(command.agentId);
      if (!node) {
        logger.warn('Owner fire: agent not found', { agentId: command.agentId });
        return;
      }
      try {
        await ctx.registry.stop(node.id);
        ctx.registry.unregister(node.id);
      } catch {
        // Best-effort
      }
      const graph = ctx.getGraph();
      ctx.setGraph({ ...graph, nodes: graph.nodes.filter((n) => n.id !== node.id) });
      graphMutated = true;
      logger.info('Owner fire: agent removed', { agentId: node.id });
      break;
    }
  }

  if (graphMutated) {
    ctx.persistGraph();
  }
}

async function handlePause(
  command: Extract<OwnerCommand, { readonly type: 'pause' }>,
  ctx: OwnerCommandContext,
): Promise<boolean> {
  const logger = getLogger();
  const graph = ctx.getGraph();
  const ws = graph.workspaces.find(
    (w) => w.id === command.workspaceId || w.name === command.workspaceId,
  );
  if (!ws) {
    logger.warn('Owner pause: workspace not found', { workspaceId: command.workspaceId });
    return false;
  }
  const wsNodeIds = graph.nodes.filter((n) => n.workspaceId === ws.id).map((n) => n.id);
  ctx.setGraph({
    ...graph,
    nodes: graph.nodes.map((n) =>
      wsNodeIds.includes(n.id) ? { ...n, status: 'disconnected' as const } : n,
    ),
  });
  for (const nodeId of wsNodeIds) {
    try {
      await ctx.registry.stop(nodeId);
    } catch {
      // Best-effort channel stop
    }
  }
  logger.info('Owner pause: workspace paused', {
    workspaceId: ws.id,
    nodeCount: wsNodeIds.length,
  });
  return true;
}

async function handleReview(
  command: Extract<OwnerCommand, { readonly type: 'review' }>,
  ctx: OwnerCommandContext,
): Promise<void> {
  const logger = getLogger();
  const node = ctx.resolveAgent(command.agentId);
  if (!node) {
    logger.warn('Owner review: agent not found', { agentId: command.agentId });
    return;
  }
  let summary = `[Review] Agent: ${node.label} (${node.id})\nPlatform: ${node.platform}\nAutonomy: ${node.autonomy}\nRole: ${node.role}`;
  if (ctx.kpiTracker) {
    const perf = ctx.kpiTracker.getPerformance(node.id);
    summary += `\nMessages: ${String(perf.messagesHandled)}\nTasks: ${String(perf.tasksCompleted)}\nAvg Response: ${String(Math.round(perf.avgResponseTimeMs))}ms`;
  }
  const graph = ctx.getGraph();
  for (const n of graph.nodes) {
    if (n.platform === 'owner') continue;
    if (isOwnerChannelNode(ctx.ownerIdentity, n)) {
      try {
        await ctx.registry.sendTo(n.id, summary, null);
        break;
      } catch {
        // Try next
      }
    }
  }
  logger.info('Owner review sent', { agentId: node.id });
}

