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
import { startMcpServer } from './mcp/server.js';
import { getLogger } from './utils/logger.js';
import { recordSpend, isOverBudget } from './utils/budget.js';

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

  let telegram: TelegramChannel | null = null;
  if (config.channels.telegram.enabled) {
    const token = process.env['TELEGRAM_BOT_TOKEN'];
    if (token) {
      telegram = new TelegramChannel({
        token,
        allowedUserIds: config.channels.telegram.allowedUserIds,
        db,
        router,
        audit,
      });
    } else {
      logger.warn('Telegram enabled but TELEGRAM_BOT_TOKEN not set');
    }
  }

  const engine = new ProactiveEngine(db, router, (alert) => handleAlert(alert, telegram));
  engine.start();
  logger.info('Proactive engine started');

  if (telegram) {
    await telegram.start();
    logger.info('Telegram bot started');
  }

  const mcpServer = await startMcpServer({ db, router, audit });
  logger.info('MCP server started on stdio');

  const refreshInterval = setInterval(() => {
    void refreshOAuthTokenIfNeeded('anthropic');
  }, 1_800_000);

  audit.logAction('daemon:start', { mcpServers: Object.keys(config.mcp.servers) });

  return { db, config, audit, router, mcpClients, engine, telegram, mcpServer, refreshInterval };
}

export async function stopDaemonContext(ctx: DaemonContext): Promise<void> {
  const logger = getLogger();
  logger.info('Daemon shutting down');

  clearInterval(ctx.refreshInterval);
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
