import { existsSync } from 'node:fs';
import { openDatabase, closeDatabase } from './db/connection.js';
import { applySchema } from './db/schema.js';
import { loadConfig } from './config/loader.js';
import { AuditLogger } from './security/audit.js';
import { ModelRouter } from './ai/router.js';
import { resolveApiKey } from './auth/resolve.js';
import { startDaemon } from './daemon.js';
import { getVersion } from './utils/version.js';
import { paths } from './config/paths.js';
import type { AppContext } from './cli-actions.js';
import { statusAction } from './cli-actions.js';
import { registerCommands } from './cli-commands.js';

import { Command } from 'commander';

const program = new Command();

const SKIP_FIRST_RUN_CHECK = new Set([
  'onboard',
  'setup',
  'doctor',
  'help',
  'mcp-server',
  'connect',
]);

function w(text: string): void {
  process.stdout.write(`${text}\n`);
}

function isFirstRun(): boolean {
  return !existsSync(paths.config);
}

async function redirectToOnboard(): Promise<void> {
  w('');
  w('Welcome to Sauria! No configuration found.');
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
  .name('sauria')
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
  .command('status')
  .description('Show system status')
  .action(
    withContext((ctx) => {
      statusAction(ctx);
    }),
  );

registerCommands(program, withContext);

export { program };
