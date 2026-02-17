import { readFileSync, existsSync, watch, type FSWatcher } from 'node:fs';
import type BetterSqlite3 from 'better-sqlite3';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { openDatabase, closeDatabase } from './db/connection.js';
import { applySchema } from './db/schema.js';
import { loadConfig } from './config/loader.js';
import { ensureConfigDir } from './config/loader.js';
import type { OpenWindConfig } from './config/schema.js';
import { AuditLogger } from './security/audit.js';
import { runSecurityChecks } from './security/startup-checks.js';
import { ModelRouter } from './ai/router.js';
import { resolveApiKey } from './auth/resolve.js';
import { refreshOAuthTokenIfNeeded } from './auth/oauth.js';
import { McpClientManager } from './mcp/client.js';
import { ProactiveEngine } from './engine/proactive.js';
import type { ProactiveAlert } from './engine/proactive.js';
import { TelegramChannel } from './channels/telegram.js';
import { SlackChannel } from './channels/slack.js';
import { TranscriptionService } from './channels/transcription.js';
import { IngestPipeline } from './ingestion/pipeline.js';
import { createLimiter, SECURITY_LIMITS } from './security/rate-limiter.js';
import { vaultGet } from './security/vault-key.js';
import { startMcpServer } from './mcp/server.js';
import { getLogger } from './utils/logger.js';
import { recordSpend, isOverBudget } from './utils/budget.js';
import { paths } from './config/paths.js';
import { ChannelRegistry } from './channels/registry.js';
import { AgentOrchestrator } from './orchestrator/orchestrator.js';
import { LLMRoutingBrain } from './orchestrator/llm-router.js';
import { MessageQueue } from './orchestrator/message-queue.js';
import type { CanvasGraph, CEOIdentity, AgentNode, InboundMessage } from './orchestrator/types.js';
import { createEmptyGraph } from './orchestrator/types.js';

export interface DaemonContext {
  readonly db: BetterSqlite3.Database;
  readonly config: OpenWindConfig;
  readonly audit: AuditLogger;
  readonly router: ModelRouter;
  readonly mcpClients: McpClientManager;
  readonly engine: ProactiveEngine;
  readonly telegram: TelegramChannel | null;
  readonly mcpServer: McpServer;
  readonly refreshInterval: ReturnType<typeof setInterval>;
  readonly registry: ChannelRegistry | null;
  readonly orchestrator: AgentOrchestrator | null;
  readonly queue: MessageQueue | null;
  readonly canvasWatcher: FSWatcher | null;
}

function handleAlert(alert: ProactiveAlert, telegram: TelegramChannel | null): void {
  const logger = getLogger();
  logger.info(`Alert: [${alert.type}] ${alert.title}`, {
    priority: alert.priority,
    entityIds: alert.entityIds,
  });
  if (telegram) {
    void telegram.sendAlert(alert);
  }
}

async function connectMcpSources(
  config: OpenWindConfig,
  mcpClients: McpClientManager,
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

// ─── Canvas Graph Loading ─────────────────────────────────────────────

function loadCanvasGraph(): CanvasGraph {
  if (!existsSync(paths.canvas)) {
    return createEmptyGraph();
  }
  try {
    const raw = readFileSync(paths.canvas, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<CanvasGraph>;
    return {
      version: 2,
      workspaces: parsed.workspaces ?? [],
      nodes: parsed.nodes ?? [],
      edges: parsed.edges ?? [],
      viewport: parsed.viewport ?? { x: 0, y: 0, zoom: 1 },
    };
  } catch {
    return createEmptyGraph();
  }
}

function buildCeoIdentity(config: OpenWindConfig): CEOIdentity {
  return {
    telegram: config.ceo.telegram,
    slack: config.ceo.slack,
    whatsapp: config.ceo.whatsapp,
  };
}

// ─── Channel Factory ──────────────────────────────────────────────────

async function createChannelForNode(
  node: AgentNode,
  deps: {
    db: BetterSqlite3.Database;
    router: ModelRouter;
    audit: AuditLogger;
    config: OpenWindConfig;
    onInbound: (message: InboundMessage) => void;
  },
): Promise<TelegramChannel | SlackChannel | null> {
  const logger = getLogger();
  const { db, router, audit, config, onInbound } = deps;

  // Try per-node token first, fall back to legacy global key
  const nodeToken = await vaultGet(`channel_token_${node.id}`);

  if (node.platform === 'telegram') {
    const token = nodeToken ?? await vaultGet('telegram_bot_token');
    if (!token) {
      logger.warn(`Skipping node ${node.id}: no telegram token in vault`);
      return null;
    }

    const { voice } = config.channels.telegram;
    const transcription = voice.enabled
      ? new TranscriptionService({
          model: voice.model,
          maxDurationSeconds: voice.maxDurationSeconds,
        })
      : null;

    const pipeline = new IngestPipeline(
      db,
      router,
      audit,
      createLimiter(`tg_ingest_${node.id}`, SECURITY_LIMITS.ingestion.maxEventsPerHour, 3_600_000),
    );

    const ceoTelegramId = config.ceo.telegram?.userId;
    return new TelegramChannel({
      token,
      allowedUserIds: config.channels.telegram.allowedUserIds,
      db,
      router,
      audit,
      pipeline,
      transcription,
      nodeId: node.id,
      ceoUserId: ceoTelegramId,
      onInbound,
    });
  }

  if (node.platform === 'slack') {
    const token = nodeToken ?? await vaultGet('slack_bot_token');
    const signingSecret = await vaultGet(`channel_signing_${node.id}`)
      ?? await vaultGet('slack_signing_secret');

    if (!token || !signingSecret) {
      logger.warn(`Skipping node ${node.id}: no slack credentials in vault`);
      return null;
    }

    const pipeline = new IngestPipeline(
      db,
      router,
      audit,
      createLimiter(`slack_ingest_${node.id}`, SECURITY_LIMITS.ingestion.maxEventsPerHour, 3_600_000),
    );

    return new SlackChannel({
      token,
      signingSecret,
      channelIds: [],
      ceoUserId: config.ceo.slack?.userId,
      nodeId: node.id,
      audit,
      pipeline,
      onInbound,
    });
  }

  // WhatsApp, Discord, Email — channels exist but not yet integrated as daemon services
  logger.info(`Platform ${node.platform} on node ${node.id} not yet supported in daemon`);
  return null;
}

// ─── Orchestrator Setup ───────────────────────────────────────────────

interface OrchestratorBundle {
  readonly registry: ChannelRegistry;
  readonly orchestrator: AgentOrchestrator;
  readonly queue: MessageQueue;
  readonly startedChannels: Array<{ nodeId: string; channel: TelegramChannel | SlackChannel }>;
}

async function setupOrchestrator(
  graph: CanvasGraph,
  deps: {
    db: BetterSqlite3.Database;
    router: ModelRouter;
    audit: AuditLogger;
    config: OpenWindConfig;
  },
): Promise<OrchestratorBundle | null> {
  const logger = getLogger();

  const connectedNodes = graph.nodes.filter(
    (n) => n.status === 'connected' && n.platform !== 'ceo',
  );

  if (connectedNodes.length === 0) {
    return null;
  }

  // 1. Create empty registry and orchestrator first (no chicken-and-egg)
  const registry = new ChannelRegistry();

  const brain = new LLMRoutingBrain(
    deps.router,
    deps.db,
    deps.config.orchestrator.routingCacheTtlMs,
  );

  const ceoIdentity = buildCeoIdentity(deps.config);
  const orchestrator = new AgentOrchestrator({
    registry,
    graph,
    ceoIdentity,
    brain,
  });

  const queue = new MessageQueue(
    (msg: InboundMessage) => orchestrator.handleInbound(msg),
    {
      maxConcurrent: deps.config.orchestrator.maxMessagesPerSecond,
      maxQueueSize: 1000,
    },
  );

  // 2. Create channels with onInbound wired to the queue
  const onInbound = (msg: InboundMessage): void => {
    queue.enqueue(msg);
  };

  const channelDeps = { ...deps, onInbound };
  const startedChannels: OrchestratorBundle['startedChannels'] = [];

  for (const node of connectedNodes) {
    const channel = await createChannelForNode(node, channelDeps);
    if (!channel) continue;

    registry.register(node.id, channel);
    startedChannels.push({ nodeId: node.id, channel });
  }

  if (startedChannels.length === 0) {
    logger.info('No channels could be created from canvas graph');
    return null;
  }

  // 3. Start all channels
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

// ─── Daemon Lifecycle ─────────────────────────────────────────────────

export async function startDaemonContext(): Promise<DaemonContext> {
  const logger = getLogger();
  logger.info('Daemon starting');

  await runSecurityChecks();
  logger.info('Security checks passed');

  await ensureConfigDir();
  const db = openDatabase();
  applySchema(db);
  logger.info('Database opened and schema applied');

  const config = await loadConfig();
  logger.info('Config loaded');

  const audit = new AuditLogger(db);
  const router = new ModelRouter(config, resolveApiKey);

  router.onCostIncurred((model, costUsd) => {
    recordSpend(db, costUsd, model);
    if (isOverBudget(db, config.budget.dailyLimitUsd)) {
      logger.warn('Daily budget limit reached', {
        limit: config.budget.dailyLimitUsd,
      });
    }
  });

  const mcpClients = new McpClientManager(audit);
  await connectMcpSources(config, mcpClients);

  // ─── Canvas-based orchestrator setup ────────────────────────────────
  const graph = loadCanvasGraph();
  const channelDeps = { db, router, audit, config };

  const bundle = await setupOrchestrator(graph, channelDeps);
  const registry: ChannelRegistry | null = bundle?.registry ?? null;
  const orchestrator: AgentOrchestrator | null = bundle?.orchestrator ?? null;
  const queue: MessageQueue | null = bundle?.queue ?? null;

  if (bundle) {
    logger.info('Orchestrator started', {
      channels: bundle.startedChannels.length,
      nodes: graph.nodes.length,
      edges: graph.edges.length,
    });
  }

  // ─── Legacy single-bot fallback ─────────────────────────────────────
  // If no orchestrator was set up but legacy telegram config is enabled,
  // keep backward-compatible single-bot mode.
  let telegram: TelegramChannel | null = null;
  const hasOrchestratorTelegram = bundle?.startedChannels.some(
    (c) => c.channel.name === 'telegram',
  ) ?? false;

  if (!hasOrchestratorTelegram && config.channels.telegram.enabled) {
    const token = await vaultGet('telegram_bot_token');
    if (token) {
      const { voice } = config.channels.telegram;
      const transcription = voice.enabled
        ? new TranscriptionService({
            model: voice.model,
            maxDurationSeconds: voice.maxDurationSeconds,
          })
        : null;
      const pipeline = new IngestPipeline(
        db,
        router,
        audit,
        createLimiter('telegram_ingest', SECURITY_LIMITS.ingestion.maxEventsPerHour, 3_600_000),
      );
      telegram = new TelegramChannel({
        token,
        allowedUserIds: config.channels.telegram.allowedUserIds,
        db,
        router,
        audit,
        pipeline,
        transcription,
      });
    } else {
      logger.warn('Telegram enabled but bot token not found in vault. Run: openwind connect telegram');
    }
  }

  const engine = new ProactiveEngine(db, router, (alert) => handleAlert(alert, telegram));
  engine.start();
  logger.info('Proactive engine started');

  if (telegram) {
    await telegram.start();
    logger.info('Telegram bot started (legacy single-bot mode)');
  }

  const mcpServer = await startMcpServer({ db, router, audit });
  logger.info('MCP server started on stdio');

  const refreshInterval = setInterval(() => {
    void refreshOAuthTokenIfNeeded('anthropic');
  }, 1_800_000);

  // ─── Canvas file watcher ────────────────────────────────────────────
  let canvasWatcher: FSWatcher | null = null;
  try {
    canvasWatcher = watch(paths.canvas, { persistent: false }, () => {
      const newGraph = loadCanvasGraph();
      if (orchestrator) {
        orchestrator.updateGraph(newGraph);
        logger.info('Canvas graph reloaded', { nodes: newGraph.nodes.length });
      }
    });
  } catch {
    // File may not exist yet, watcher will fail gracefully
    logger.info('Canvas watcher not started (file may not exist yet)');
  }

  audit.logAction('daemon:start', {
    mcpServers: Object.keys(config.mcp.servers),
    orchestratorActive: bundle !== null,
    orchestratorChannels: bundle?.startedChannels.length ?? 0,
  });

  return {
    db,
    config,
    audit,
    router,
    mcpClients,
    engine,
    telegram,
    mcpServer,
    refreshInterval,
    registry,
    orchestrator,
    queue,
    canvasWatcher,
  };
}

export async function stopDaemonContext(ctx: DaemonContext): Promise<void> {
  const logger = getLogger();
  logger.info('Daemon shutting down');

  clearInterval(ctx.refreshInterval);

  if (ctx.canvasWatcher) {
    ctx.canvasWatcher.close();
    logger.info('Canvas watcher stopped');
  }

  if (ctx.queue) {
    ctx.queue.stop();
    logger.info('Message queue stopped');
  }

  if (ctx.registry) {
    await ctx.registry.stopAll();
    logger.info('All orchestrator channels stopped');
  }

  ctx.engine.stop();
  logger.info('Proactive engine stopped');

  if (ctx.telegram) {
    await ctx.telegram.stop();
    logger.info('Telegram bot stopped');
  }

  await ctx.mcpClients.disconnectAll();
  logger.info('MCP clients disconnected');

  ctx.audit.logAction('daemon:stop', {});
  closeDatabase(ctx.db);
  logger.info('Database closed');
  logger.info('Daemon stopped');
}
