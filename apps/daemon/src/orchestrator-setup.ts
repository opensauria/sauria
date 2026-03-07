import type BetterSqlite3 from 'better-sqlite3';
import type { Channel } from './channels/base.js';
import { ChannelRegistry } from './channels/registry.js';
import { AgentOrchestrator } from './orchestrator/orchestrator.js';
import { LLMRoutingBrain } from './orchestrator/llm-router.js';
import { MessageQueue } from './orchestrator/message-queue.js';
import { AgentMemory } from './orchestrator/agent-memory.js';
import { KPITracker } from './orchestrator/kpi-tracker.js';
import type { CheckpointManager } from './orchestrator/checkpoint.js';
import type { IntegrationRegistry } from './integrations/registry.js';
import { INTEGRATION_CATALOG } from './integrations/catalog.js';
import { vaultGet } from './security/vault-key.js';
import { getLogger } from './utils/logger.js';
import { paths } from './config/paths.js';
import { buildOwnerIdentity } from './graph-loader.js';
import { createChannelForNode } from './channel-factory.js';
import type { ModelRouter } from './ai/router.js';
import type { AuditLogger } from './security/audit.js';
import type { SauriaConfig } from './config/schema.js';
import type { CanvasGraph, InboundMessage } from './orchestrator/types.js';

export interface OrchestratorBundle {
  readonly registry: ChannelRegistry;
  readonly orchestrator: AgentOrchestrator;
  readonly queue: MessageQueue;
  readonly startedChannels: ReadonlyArray<{ readonly nodeId: string; readonly channel: Channel }>;
}

export async function connectMcpSources(
  config: SauriaConfig,
  mcpClients: { connect: (opts: { name: string; command: string; args: string[] }) => Promise<void> },
): Promise<void> {
  const logger = getLogger();
  const serverEntries = Object.entries(config.mcp.servers);

  for (const [name, serverConfig] of serverEntries) {
    if (!serverConfig) continue;
    try {
      await mcpClients.connect({
        name,
        command: serverConfig.command,
        args: [...serverConfig.args],
      });
      logger.info(`MCP client connected: ${name}`);
    } catch (err: unknown) {
      logger.error(`Failed to connect MCP client: ${name}`, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

export async function autoConnectIntegrations(
  registry: IntegrationRegistry,
  config: SauriaConfig,
): Promise<void> {
  const logger = getLogger();
  const integrations = config.integrations ?? {};

  for (const [id, settings] of Object.entries(integrations)) {
    if (!settings?.enabled) continue;
    try {
      const creds: Record<string, string> = {};
      const definition = INTEGRATION_CATALOG.find((d) => d.id === id);
      if (!definition) continue;

      for (const key of definition.credentialKeys) {
        const value = await vaultGet(`integration_${id}_${key}`);
        if (value) creds[key] = value;
      }

      if (Object.keys(creds).length < definition.credentialKeys.length) {
        logger.warn(`Skipping integration ${id}: missing credentials`);
        continue;
      }

      await registry.connect(id, creds);
    } catch (err: unknown) {
      logger.error(`Failed to auto-connect integration: ${id}`, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

export async function setupOrchestrator(
  graph: CanvasGraph,
  deps: {
    readonly db: BetterSqlite3.Database;
    readonly router: ModelRouter;
    readonly audit: AuditLogger;
    readonly config: SauriaConfig;
  },
  checkpointManager: CheckpointManager,
  onActivity?: (event: string, data: Record<string, unknown>) => void,
  integrationRegistry?: IntegrationRegistry,
): Promise<OrchestratorBundle | null> {
  const logger = getLogger();

  const connectedNodes = graph.nodes.filter(
    (n) => n.status === 'connected' && n.platform !== 'owner',
  );

  if (connectedNodes.length === 0) {
    return null;
  }

  const registry = new ChannelRegistry();
  const agentMemory = new AgentMemory(deps.db);
  const kpiTracker = new KPITracker(deps.db);

  const brain = new LLMRoutingBrain(
    deps.router,
    deps.db,
    deps.config.orchestrator.routingCacheTtlMs,
    integrationRegistry,
  );

  const ownerIdentity = buildOwnerIdentity(deps.config);
  const orchestrator = new AgentOrchestrator({
    registry, graph, ownerIdentity, brain,
    db: deps.db, agentMemory, kpiTracker, checkpointManager,
    canvasPath: paths.canvas, onActivity, integrationRegistry,
  });

  const queue = new MessageQueue((msg: InboundMessage) => orchestrator.handleInbound(msg), {
    maxConcurrent: deps.config.orchestrator.maxMessagesPerSecond,
    maxQueueSize: 1000,
  });

  const onInbound = (msg: InboundMessage): void => {
    queue.enqueue(msg);
  };

  const channelDeps = { ...deps, onInbound, globalInstructions: graph.globalInstructions };
  const startedChannels: Array<{ nodeId: string; channel: Channel }> = [];
  const usedTokens = new Set<string>();

  for (const node of connectedNodes) {
    const resolvedToken = await vaultGet(`channel_token_${node.id}`);
    if (resolvedToken) {
      if (usedTokens.has(resolvedToken)) {
        logger.warn(
          `Skipping node ${node.id}: token already in use by another node. Each bot needs a unique token.`,
        );
        continue;
      }
      usedTokens.add(resolvedToken);
    }

    const channel = await createChannelForNode(node, channelDeps);
    if (!channel) continue;

    registry.register(node.id, channel);
    startedChannels.push({ nodeId: node.id, channel });
  }

  if (startedChannels.length === 0) {
    logger.info('No channels could be created from canvas graph');
    return null;
  }

  for (const { nodeId, channel } of startedChannels) {
    try {
      await channel.start();
      logger.info(`Channel started for node ${nodeId} (${channel.name})`);
    } catch (error) {
      logger.error(`Failed to start channel for node ${nodeId}`, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { registry, orchestrator, queue, startedChannels };
}
