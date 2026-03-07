import type { FSWatcher } from 'node:fs';
import type BetterSqlite3 from 'better-sqlite3';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { openDatabase, closeDatabase } from './db/connection.js';
import { applySchema } from './db/schema.js';
import { runMigrations } from './db/migrations.js';
import { loadConfig, saveConfig } from './config/loader.js';
import { ensureConfigDir } from './config/loader.js';
import type { SauriaConfig } from './config/schema.js';
import { AuditLogger } from './security/audit.js';
import { runSecurityChecks } from './security/startup-checks.js';
import { ModelRouter } from './ai/router.js';
import { resolveApiKey } from './auth/resolve.js';
import { refreshOAuthTokenIfNeeded } from './auth/oauth.js';
import { McpClientManager } from './mcp/client.js';
import { ProactiveEngine } from './engine/proactive.js';
import { startMcpServer } from './mcp/server.js';
import { getLogger } from './utils/logger.js';
import { recordSpend, isOverBudget } from './utils/budget.js';
import { paths } from './config/paths.js';
import { startIpcServer, type DaemonIpcServer } from './daemon-ipc.js';
import type { ChannelRegistry } from './channels/registry.js';
import type { AgentOrchestrator } from './orchestrator/orchestrator.js';
import type { MessageQueue } from './orchestrator/message-queue.js';
import { CheckpointManager } from './orchestrator/checkpoint.js';
import { IntegrationRegistry } from './integrations/registry.js';
import { INTEGRATION_CATALOG } from './integrations/catalog.js';
import { TokenRefreshService } from './integrations/token-refresh.js';
import { acquirePidLock, releasePidLock } from './pid-lock.js';
import { loadCanvasGraph } from './graph-loader.js';
import {
  connectMcpSources,
  autoConnectIntegrations,
  setupOrchestrator,
} from './orchestrator-setup.js';
import { registerIntegrationHandlers } from './integration-ipc.js';
import { setupCanvasWatcher, setupOwnerCommandWatcher } from './daemon-watchers.js';
import { vaultGet } from './security/vault-key.js';

export interface DaemonContext {
  readonly db: BetterSqlite3.Database;
  readonly config: SauriaConfig;
  readonly audit: AuditLogger;
  readonly router: ModelRouter;
  readonly mcpClients: McpClientManager;
  readonly engine: ProactiveEngine;
  readonly mcpServer: McpServer;
  readonly refreshInterval: ReturnType<typeof setInterval>;
  readonly registry: ChannelRegistry | null;
  readonly orchestrator: AgentOrchestrator | null;
  readonly queue: MessageQueue | null;
  readonly ipcServer: DaemonIpcServer;
  readonly integrationRegistry: IntegrationRegistry;
  readonly tokenRefreshService: TokenRefreshService;
  readonly canvasWatcher: FSWatcher | null;
  readonly ownerCommandWatcher: FSWatcher | null;
}

export async function startDaemonContext(): Promise<DaemonContext> {
  const logger = getLogger();
  logger.info('Daemon starting');

  acquirePidLock();

  await runSecurityChecks();
  logger.info('Security checks passed');

  await ensureConfigDir();
  const db = openDatabase();
  applySchema(db);
  runMigrations(db, paths.home);

  const config = await loadConfig();
  logger.info('Database ready, config loaded');

  const audit = new AuditLogger(db);
  const router = new ModelRouter(config, resolveApiKey);

  router.onCostIncurred((model, costUsd) => {
    recordSpend(db, costUsd, model);
    if (isOverBudget(db, config.budget.dailyLimitUsd)) {
      logger.warn('Daily budget limit reached', { limit: config.budget.dailyLimitUsd });
    }
  });

  const mcpClients = new McpClientManager(audit);
  await connectMcpSources(config, mcpClients);

  mcpClients.startHealthMonitor();

  const integrationRegistry = new IntegrationRegistry(mcpClients, audit, INTEGRATION_CATALOG);
  await autoConnectIntegrations(integrationRegistry, config);

  // Token refresh service for OAuth integrations
  const tokenRefreshService = new TokenRefreshService(integrationRegistry, logger);

  // Schedule refreshes for any existing OAuth credentials
  for (const def of INTEGRATION_CATALOG) {
    if (!def.mcpRemote) continue;
    const vaultKey = `integration_oauth_${def.id}`;
    const stored = await vaultGet(vaultKey);
    if (!stored) continue;
    try {
      const cred = JSON.parse(stored) as { expiresAt?: number };
      if (cred.expiresAt) {
        const base = def.mcpRemote.url
          .replace(/\/mcp$/, '')
          .replace(/\/sse$/, '')
          .replace(/\/$/, '');
        const tokenUrl = `${base}/.well-known/oauth-authorization-server`;
        tokenRefreshService.scheduleRefresh(def.id, tokenUrl, cred.expiresAt);
      }
    } catch {
      // Ignore malformed credentials
    }
  }

  const ipcServer = await startIpcServer(paths.socket, db, Date.now());

  // Canvas-based orchestrator setup
  const graph = loadCanvasGraph();
  const checkpointManager = new CheckpointManager(db);

  const bundle = await setupOrchestrator(
    graph,
    { db, router, audit, config },
    checkpointManager,
    ipcServer.broadcast.bind(ipcServer),
    integrationRegistry,
  );
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

  registerIntegrationHandlers({
    ipcServer,
    integrationRegistry,
    getOrchestrator: () => orchestrator,
    loadCanvasGraph,
    loadConfig,
    saveConfig,
  });

  const engine = new ProactiveEngine(db, router, () => {});
  logger.info('Proactive engine disabled (owner-driven mode)');

  const mcpServer = await startMcpServer({
    db,
    router,
    audit,
    checkpointManager,
    orchestrator: orchestrator ?? undefined,
  });
  logger.info('MCP server started on stdio');

  const refreshInterval = setInterval(() => {
    void refreshOAuthTokenIfNeeded('anthropic');
  }, 1_800_000);

  const canvasWatcher = setupCanvasWatcher({
    orchestrator,
    registry,
    queue,
    db,
    router,
    audit,
    config,
    globalInstructions: graph.globalInstructions,
  });

  const ownerCommandWatcher = setupOwnerCommandWatcher(orchestrator, audit);

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
    mcpServer,
    refreshInterval,
    ipcServer,
    integrationRegistry,
    tokenRefreshService,
    registry,
    orchestrator,
    queue,
    canvasWatcher,
    ownerCommandWatcher,
  };
}

export async function stopDaemonContext(ctx: DaemonContext): Promise<void> {
  const logger = getLogger();
  logger.info('Daemon shutting down');

  clearInterval(ctx.refreshInterval);

  if (ctx.ownerCommandWatcher) {
    ctx.ownerCommandWatcher.close();
    logger.info('Owner command watcher stopped');
  }

  if (ctx.canvasWatcher) {
    ctx.canvasWatcher.close();
    logger.info('Canvas watcher stopped');
  }

  if (ctx.queue) {
    await ctx.queue.gracefulStop(5000);
    logger.info('Message queue stopped');
  }

  if (ctx.registry) {
    await ctx.registry.stopAll();
    logger.info('All orchestrator channels stopped');
  }

  ctx.engine.stop();
  logger.info('Proactive engine stopped');

  ctx.tokenRefreshService.stop();
  logger.info('Token refresh service stopped');

  await ctx.integrationRegistry.disconnectAll();
  ctx.mcpClients.stopHealthMonitor();
  await ctx.mcpClients.disconnectAll();
  logger.info('Integrations and MCP clients disconnected');

  await ctx.ipcServer.close();

  ctx.audit.logAction('daemon:stop', {});
  closeDatabase(ctx.db);
  logger.info('Database closed');

  releasePidLock();
  logger.info('Daemon stopped');
}
