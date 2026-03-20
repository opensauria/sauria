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
import type { McpClientManager } from './mcp/client.js';
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
import { CodeModeRouter } from './orchestrator/code-mode-router.js';
import { ClaudeCliService } from './ai/providers/claude-cli.js';
import { persistCanvasGraph } from './graph-persistence.js';
import { loadCanvasGraph } from './graph-loader.js';

export interface OrchestratorBundle {
  readonly registry: ChannelRegistry;
  readonly orchestrator: AgentOrchestrator;
  readonly queue: MessageQueue;
  readonly startedChannels: ReadonlyArray<{ readonly nodeId: string; readonly channel: Channel }>;
}

export async function connectMcpSources(
  config: SauriaConfig,
  mcpClients: {
    connect: (opts: { name: string; command: string; args: string[] }) => Promise<void>;
  },
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

export async function connectPersonalMcpSources(
  graph: CanvasGraph,
  mcpClients: McpClientManager,
  integrationRegistry: IntegrationRegistry,
): Promise<void> {
  const logger = getLogger();
  const entries = graph.personalMcp ?? [];

  if (entries.length === 0) return;

  for (const entry of entries) {
    const instanceId = `personal:${entry.id}`;
    const serverName = `integration:${instanceId}`;

    try {
      if (entry.transport === 'stdio') {
        await mcpClients.connect({
          name: serverName,
          command: entry.command,
          args: [...entry.args],
          env: entry.env ? ({ ...process.env, ...entry.env } as Record<string, string>) : undefined,
        });
      } else {
        await mcpClients.connectRemote({
          name: serverName,
          url: entry.url,
          accessToken: entry.accessToken ?? '',
        });
      }

      // Get tool count and register as synthetic ConnectedInstance
      const rawTools = await mcpClients.listTools(serverName);
      const tools = rawTools.map((tool) => ({
        instanceId: instanceId,
        integrationId: 'personal-mcp',
        integrationName: entry.name,
        name: `${instanceId}/${tool.name}`,
        description: tool.description,
      }));

      integrationRegistry.registerExternalInstance(instanceId, {
        instanceId: instanceId,
        integrationId: 'personal-mcp',
        label: entry.name,
        tools,
        connectedAt: entry.connectedAt,
      });

      logger.info(
        `Personal MCP connected: ${entry.name} (${entry.transport}, ${rawTools.length} tools)`,
      );
    } catch (err: unknown) {
      logger.error(`Failed to connect personal MCP: ${entry.name}`, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

export async function autoConnectIntegrations(
  registry: IntegrationRegistry,
  config: SauriaConfig,
  graph?: CanvasGraph,
): Promise<void> {
  const logger = getLogger();
  const connectedInstanceIds = new Set<string>();

  // Per-instance loading from graph (preferred path)
  const instances = graph?.instances ?? [];
  for (const instance of instances) {
    const definition = INTEGRATION_CATALOG.find((d) => d.id === instance.integrationId);
    if (!definition) continue;

    try {
      const creds: Record<string, string> = {};

      for (const key of definition.credentialKeys) {
        const instanceValue = await vaultGet(`integration_${instance.id}_${key}`);
        const legacyValue = await vaultGet(`integration_${instance.integrationId}_${key}`);
        const value = instanceValue ?? legacyValue;
        if (value) creds[key] = value;
      }

      // Check for OAuth token if credentialKeys are empty (OAuth-only integrations)
      if (definition.credentialKeys.length === 0 || Object.keys(creds).length === 0) {
        const oauthCred =
          (await vaultGet(`integration_oauth_${instance.id}`)) ??
          (await vaultGet(`integration_oauth_${instance.integrationId}`));
        if (oauthCred) {
          try {
            const parsed = JSON.parse(oauthCred) as { accessToken?: string };
            if (parsed.accessToken) creds['accessToken'] = parsed.accessToken;
          } catch {
            if (typeof oauthCred === 'string' && oauthCred.length > 0) {
              creds['accessToken'] = oauthCred;
            }
          }
        }
      }

      if (Object.keys(creds).length < definition.credentialKeys.length && !creds['accessToken']) {
        logger.warn(`Skipping instance ${instance.id}: missing credentials`);
        continue;
      }

      await registry.connectInstance(instance.id, instance.integrationId, instance.label, creds);
      connectedInstanceIds.add(instance.integrationId);
    } catch (err: unknown) {
      logger.error(`Failed to auto-connect instance: ${instance.id}`, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Legacy fallback: config-based integrations not covered by graph instances
  const integrations = config.integrations ?? {};
  for (const [id, settings] of Object.entries(integrations)) {
    if (!settings?.enabled || connectedInstanceIds.has(id)) continue;
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
    readonly resolveAnthropicKey?: () => Promise<string | null>;
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

  // Initialize Claude CLI service if binary is available
  const cliAvailable = await ClaudeCliService.isAvailable();
  const cliService = cliAvailable ? new ClaudeCliService() : null;

  if (cliService) {
    // Restore persisted CLI sessions from canvas graph
    for (const node of connectedNodes) {
      if (node.cliSessionId) {
        cliService.setSession(node.id, node.cliSessionId);
      }
    }
    logger.info('Claude CLI available — routing Anthropic agents through CLI');
  }

  const brain = new LLMRoutingBrain(
    deps.router,
    deps.db,
    deps.config.orchestrator.routingCacheTtlMs,
    integrationRegistry,
    cliService ?? undefined,
  );

  // Persist CLI session IDs to canvas.json
  brain.setCliSessionPersistCallback((nodeId: string, sessionId: string) => {
    const currentGraph = loadCanvasGraph();
    const node = currentGraph.nodes.find((n) => n.id === nodeId);
    if (!node) return;

    const updatedGraph: CanvasGraph = {
      ...currentGraph,
      nodes: currentGraph.nodes.map((n) =>
        n.id === nodeId ? { ...n, cliSessionId: sessionId } : n,
      ),
    };
    persistCanvasGraph(paths.canvas, updatedGraph);
  });

  const codeModeRouter = new CodeModeRouter(deps.audit, deps.resolveAnthropicKey);
  codeModeRouter.setSessionPersistCallback((nodeId: string, sessionId: string) => {
    const currentGraph = loadCanvasGraph();
    const node = currentGraph.nodes.find((n) => n.id === nodeId);
    if (!node?.codeMode) return;

    const updatedGraph: CanvasGraph = {
      ...currentGraph,
      nodes: currentGraph.nodes.map((n) =>
        n.id === nodeId ? { ...n, codeMode: { ...n.codeMode!, sessionId } } : n,
      ),
    };
    persistCanvasGraph(paths.canvas, updatedGraph);
  });

  const ownerIdentity = buildOwnerIdentity(deps.config);
  const orchestrator = new AgentOrchestrator({
    registry,
    graph,
    ownerIdentity,
    brain,
    db: deps.db,
    agentMemory,
    kpiTracker,
    checkpointManager,
    canvasPath: paths.canvas,
    onActivity,
    integrationRegistry,
    codeModeRouter,
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
