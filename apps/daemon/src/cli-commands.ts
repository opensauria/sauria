import type { Command } from 'commander';
import { openDatabase, closeDatabase } from './db/connection.js';
import { applySchema } from './db/schema.js';
import { loadConfig } from './config/loader.js';
import { runSecurityChecks } from './security/startup-checks.js';
import { startMcpServer } from './mcp/server.js';
import type { AppContext } from './cli-actions.js';
import {
  askAction,
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
import { startInteractiveMode } from './channels/cli-interactive.js';

function w(text: string): void {
  process.stdout.write(`${text}\n`);
}

type ContextRunner = (fn: (ctx: AppContext) => Promise<void> | void) => () => Promise<void>;

export function registerCommands(program: Command, withContext: ContextRunner): void {
  program
    .command('ask <question>')
    .description('Ask a natural language question')
    .action((question: string) => withContext((ctx) => askAction(ctx, question))());

  program
    .command('interactive')
    .description('Start interactive REPL mode')
    .action(withContext((ctx) => startInteractiveMode({ db: ctx.db, router: ctx.router })));

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

  registerServiceCommands(program);
}

function registerServiceCommands(program: Command): void {
  program
    .command('mcp-server')
    .description('Start MCP server (stdio)')
    .action(async () => {
      const { ModelRouter } = await import('./ai/router.js');
      const { AuditLogger } = await import('./security/audit.js');
      const { resolveApiKey } = await import('./auth/resolve.js');
      const config = await loadConfig();
      const db = openDatabase();
      applySchema(db);
      const audit = new AuditLogger(db);
      const router = new ModelRouter(config, resolveApiKey);
      await startMcpServer({ db, router, audit });
      process.stderr.write('MCP server running on stdio.\n');
      const cleanup = () => {
        closeDatabase(db);
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
}
