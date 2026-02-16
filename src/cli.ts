import { Command } from 'commander';
import { openDatabase, closeDatabase } from './db/connection.js';
import { applySchema } from './db/schema.js';
import { loadConfig } from './config/loader.js';
import { AuditLogger } from './security/audit.js';
import { runSecurityChecks } from './security/startup-checks.js';
import { ModelRouter } from './ai/router.js';
import { startInteractiveMode } from './channels/cli-interactive.js';
import type { AppContext } from './cli-actions.js';
import {
  askAction, statusAction, focusAction, entityAction,
  upcomingAction, insightsAction, teachAction, sourcesAction,
  auditAction, exportAction, purgeAction,
} from './cli-actions.js';

const program = new Command();

function w(text: string): void {
  process.stdout.write(`${text}\n`);
}

function getApiKey(providerName: string): string {
  const envMap: Readonly<Record<string, string>> = {
    anthropic: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY',
    google: 'GOOGLE_API_KEY', openrouter: 'OPENROUTER_API_KEY',
    together: 'TOGETHER_API_KEY', groq: 'GROQ_API_KEY', mistral: 'MISTRAL_API_KEY',
  };
  const envVar = envMap[providerName] ?? `${providerName.toUpperCase()}_API_KEY`;
  const value = process.env[envVar];
  if (!value) throw new Error(`Missing API key: set ${envVar} environment variable`);
  return value;
}

async function initContext(): Promise<AppContext> {
  const config = await loadConfig();
  const db = openDatabase();
  applySchema(db);
  const audit = new AuditLogger(db);
  const router = new ModelRouter(config, getApiKey);
  return { db, config, audit, router };
}

function withContext(fn: (ctx: AppContext) => Promise<void> | void): () => Promise<void> {
  return async () => {
    const ctx = await initContext();
    try { await fn(ctx); } finally { closeDatabase(ctx.db); }
  };
}

program.name('openwind').description('Security-first persistent cognitive kernel').version('0.1.0');

program.command('onboard').description('Interactive setup wizard')
  .action(() => { w('Onboarding wizard is not yet implemented (Phase 10).'); });

program.command('daemon').description('Start background daemon')
  .action(() => { w('Daemon mode is not yet implemented (Phase 10).'); });

program.command('ask <question>').description('Ask a natural language question')
  .action((question: string) => withContext((ctx) => askAction(ctx, question))());

program.command('interactive').description('Start interactive REPL mode')
  .action(withContext((ctx) => startInteractiveMode({ db: ctx.db, router: ctx.router })));

program.command('status').description('Show system status')
  .action(withContext((ctx) => { statusAction(ctx); }));

program.command('focus <entity>').description('Deep dive on an entity')
  .action((name: string) => withContext((ctx) => focusAction(ctx, name))());

program.command('entity <name>').description('Look up entity')
  .action((name: string) => withContext((ctx) => { entityAction(ctx, name); })());

program.command('upcoming [hours]').description('Show upcoming deadlines')
  .action((h?: string) => withContext((ctx) => { upcomingAction(ctx, parseInt(h ?? '24', 10) || 24); })());

program.command('insights').description('Show recent insights')
  .action(withContext((ctx) => { insightsAction(ctx); }));

program.command('teach <fact>').description('Manually add knowledge')
  .action((fact: string) => withContext((ctx) => { teachAction(ctx, fact); })());

program.command('sources').description('List configured data sources')
  .action(withContext((ctx) => { sourcesAction(ctx); }));

program.command('mcp-server').description('Start MCP server (stdio)')
  .action(() => { w('MCP server is not yet implemented (Phase 9).'); });

program.command('doctor').description('Run health checks').action(async () => {
  w('Running health checks...');
  try { await runSecurityChecks(); w('Security checks: PASS'); }
  catch (err: unknown) { w(`Security checks: FAIL - ${err instanceof Error ? err.message : String(err)}`); }
  try {
    const config = await loadConfig();
    w(`Config loaded: models.reasoning = ${config.models.reasoning.provider}/${config.models.reasoning.model}`);
  } catch (err: unknown) { w(`Config: FAIL - ${err instanceof Error ? err.message : String(err)}`); }
  try {
    const db = openDatabase(); applySchema(db);
    const row = db.prepare('SELECT COUNT(*) AS c FROM entities').get() as { c: number };
    w(`Database: OK (${String(row.c)} entities)`); closeDatabase(db);
  } catch (err: unknown) { w(`Database: FAIL - ${err instanceof Error ? err.message : String(err)}`); }
  w('Done.');
});

program.command('audit [count]').description('Show recent audit log')
  .action((c?: string) => withContext((ctx) => { auditAction(ctx, parseInt(c ?? '20', 10) || 20); })());

program.command('export').description('Export data')
  .action(withContext((ctx) => { exportAction(ctx); }));

program.command('import <file>').description('Import data')
  .action(() => { w('Import is not yet implemented (Phase 10).'); return Promise.resolve(); });

program.command('purge').description('Purge all data')
  .action(withContext((ctx) => { purgeAction(ctx); }));

program.command('config').description('Show current config').action(async () => {
  w(JSON.stringify(await loadConfig(), null, 2));
});

program.parse();

export { program };
