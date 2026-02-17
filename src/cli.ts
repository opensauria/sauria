import { existsSync } from 'node:fs';
import { Command } from 'commander';
import { openDatabase, closeDatabase } from './db/connection.js';
import { applySchema } from './db/schema.js';
import { loadConfig } from './config/loader.js';
import { AuditLogger } from './security/audit.js';
import { runSecurityChecks } from './security/startup-checks.js';
import { ModelRouter } from './ai/router.js';
import { resolveApiKey } from './auth/resolve.js';
import { startInteractiveMode } from './channels/cli-interactive.js';
import { startDaemon } from './daemon.js';
import { startMcpServer } from './mcp/server.js';
import { getVersion } from './utils/version.js';
import { paths } from './config/paths.js';
import type { AppContext } from './cli-actions.js';
import {
  askAction,
  statusAction,
  focusAction,
  entityAction,
  upcomingAction,
  insightsAction,
  teachAction,
  sourcesAction,
  auditAction,
  exportAction,
  purgeAction,
} from './cli-actions.js';

const program = new Command();

const SKIP_FIRST_RUN_CHECK = new Set(['onboard', 'setup', 'doctor', 'help', 'mcp-server', 'connect']);

function w(text: string): void {
  process.stdout.write(`${text}\n`);
}

function isFirstRun(): boolean {
  return !existsSync(paths.config);
}

async function redirectToOnboard(): Promise<void> {
  w('');
  w('Welcome to OpenWind! No configuration found.');
  w('Starting setup wizard...');
  w('');
  const { runOnboarding } = await import('./auth/onboard.js');
  await runOnboarding();
}

async function initContext(): Promise<AppContext> {
  const config = await loadConfig();
  const db = openDatabase();
  applySchema(db);
  const audit = new AuditLogger(db);
  const router = new ModelRouter(config, resolveApiKey);
  return { db, config, audit, router };
}

function withContext(fn: (ctx: AppContext) => Promise<void> | void): () => Promise<void> {
  return async () => {
    const ctx = await initContext();
    try {
      await fn(ctx);
    } finally {
      closeDatabase(ctx.db);
    }
  };
}

program
  .name('openwind')
  .description('Security-first persistent cognitive kernel')
  .version(getVersion())
  .hook('preAction', async (thisCommand) => {
    const commandName = thisCommand.args[0] ?? thisCommand.name();
    if (SKIP_FIRST_RUN_CHECK.has(commandName)) return;
    if (isFirstRun()) {
      await redirectToOnboard();
      process.exit(0);
    }
  })
  .action(async () => {
    // Default command (no args): show status if configured, onboard if not
    if (isFirstRun()) {
      await redirectToOnboard();
    } else {
      await withContext((ctx) => {
        statusAction(ctx);
      })();
    }
  });

program
  .command('onboard')
  .description('Interactive setup wizard')
  .action(async () => {
    const { runOnboarding } = await import('./auth/onboard.js');
    await runOnboarding();
  });

program
  .command('setup')
  .description('Non-interactive setup (for install scripts)')
  .requiredOption('--provider <name>', 'AI provider (anthropic, openai, google, ollama)')
  .option('--api-key <key>', 'API key or OAuth token')
  .option('--no-validate', 'Skip credential validation')
  .action(async (opts: { provider: string; apiKey?: string; validate: boolean }) => {
    const { runSilentSetup } = await import('./setup/silent-setup.js');
    const result = await runSilentSetup({
      provider: opts.provider,
      apiKey: opts.apiKey ?? '',
      validate: opts.validate,
    });
    if (!result.success) {
      w(`Error: ${result.error ?? 'Setup failed'}`);
      process.exit(1);
    }
    if (result.mcpClients.length > 0) {
      w(`MCP registered: ${result.mcpClients.join(', ')}`);
    }
    if (result.daemonCommand) {
      w(`Daemon: ${result.daemonCommand}`);
    }
  });

program
  .command('daemon')
  .description('Start background daemon')
  .action(() => startDaemon());

program
  .command('ask <question>')
  .description('Ask a natural language question')
  .action((question: string) => withContext((ctx) => askAction(ctx, question))());

program
  .command('interactive')
  .description('Start interactive REPL mode')
  .action(withContext((ctx) => startInteractiveMode({ db: ctx.db, router: ctx.router })));

program
  .command('status')
  .description('Show system status')
  .action(
    withContext((ctx) => {
      statusAction(ctx);
    }),
  );

program
  .command('focus <entity>')
  .description('Deep dive on an entity')
  .action((name: string) => withContext((ctx) => focusAction(ctx, name))());

program
  .command('entity <name>')
  .description('Look up entity')
  .action((name: string) =>
    withContext((ctx) => {
      entityAction(ctx, name);
    })(),
  );

program
  .command('upcoming [hours]')
  .description('Show upcoming deadlines')
  .action((h?: string) =>
    withContext((ctx) => {
      upcomingAction(ctx, parseInt(h ?? '24', 10) || 24);
    })(),
  );

program
  .command('insights')
  .description('Show recent insights')
  .action(
    withContext((ctx) => {
      insightsAction(ctx);
    }),
  );

program
  .command('teach <fact>')
  .description('Manually add knowledge')
  .action((fact: string) =>
    withContext((ctx) => {
      teachAction(ctx, fact);
    })(),
  );

program
  .command('sources')
  .description('List configured data sources')
  .action(
    withContext((ctx) => {
      sourcesAction(ctx);
    }),
  );

program
  .command('mcp-server')
  .description('Start MCP server (stdio)')
  .action(async () => {
    const ctx = await initContext();
    await startMcpServer({ db: ctx.db, router: ctx.router, audit: ctx.audit });
    process.stderr.write('MCP server running on stdio.\n');
    // Keep alive — DB stays open for the lifetime of the process.
    // Cleanup on exit signals.
    const cleanup = () => {
      closeDatabase(ctx.db);
      process.exit(0);
    };
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
  });

program
  .command('doctor')
  .description('Run health checks')
  .action(async () => {
    w('Running health checks...');
    try {
      await runSecurityChecks();
      w('Security checks: PASS');
    } catch (err: unknown) {
      w(`Security checks: FAIL - ${err instanceof Error ? err.message : String(err)}`);
    }
    try {
      const config = await loadConfig();
      w(
        `Config loaded: models.reasoning = ${config.models.reasoning.provider}/${config.models.reasoning.model}`,
      );
    } catch (err: unknown) {
      w(`Config: FAIL - ${err instanceof Error ? err.message : String(err)}`);
    }
    try {
      const db = openDatabase();
      applySchema(db);
      const row = db.prepare('SELECT COUNT(*) AS c FROM entities').get() as { c: number };
      w(`Database: OK (${String(row.c)} entities)`);
      closeDatabase(db);
    } catch (err: unknown) {
      w(`Database: FAIL - ${err instanceof Error ? err.message : String(err)}`);
    }
    w('Done.');
  });

program
  .command('audit [count]')
  .description('Show recent audit log')
  .action((c?: string) =>
    withContext((ctx) => {
      auditAction(ctx, parseInt(c ?? '20', 10) || 20);
    })(),
  );

program
  .command('export')
  .description('Export data')
  .action(
    withContext((ctx) => {
      exportAction(ctx);
    }),
  );

program
  .command('import <file>')
  .description('Import data')
  .action(() => {
    w('Import is not yet implemented (Phase 10).');
    return Promise.resolve();
  });

program
  .command('purge')
  .description('Purge all data')
  .action(
    withContext((ctx) => {
      purgeAction(ctx);
    }),
  );

program
  .command('connect')
  .description('Connect a channel')
  .argument('<channel>', 'Channel to connect (telegram)')
  .action(async (channel: string) => {
    if (channel !== 'telegram') {
      w(`Unknown channel: ${channel}. Supported: telegram`);
      process.exit(1);
    }
    const { connectTelegram } = await import('./channels/connect-telegram.js');
    await connectTelegram();
  });

program
  .command('config')
  .description('Show current config')
  .action(async () => {
    w(JSON.stringify(await loadConfig(), null, 2));
  });

export { program };
