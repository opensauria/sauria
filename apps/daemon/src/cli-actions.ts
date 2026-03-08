import type BetterSqlite3 from 'better-sqlite3';
import type { SauriaConfig } from './config/schema.js';
import type { AuditLogger } from './security/audit.js';
import type { ModelRouter } from './ai/router.js';
import { sanitizeChannelInput } from './security/sanitize.js';
import { reasonAbout } from './ai/reason.js';
import { searchByKeyword } from './db/search.js';
import { getUpcomingDeadlines } from './db/temporal.js';
import {
  getEntityByName,
  getEntityRelations,
  getEntityTimeline,
  searchEntities,
} from './db/world-model.js';

export interface AppContext {
  readonly db: BetterSqlite3.Database;
  readonly config: SauriaConfig;
  readonly audit: AuditLogger;
  readonly router: ModelRouter;
}

function w(text: string): void {
  process.stdout.write(`${text}\n`);
}

function countRows(db: BetterSqlite3.Database, sql: string): number {
  return (db.prepare(sql).get() as { c: number }).c;
}

export async function askAction(ctx: AppContext, question: string): Promise<void> {
  const sanitized = sanitizeChannelInput(question);
  const entities = searchByKeyword(ctx.db, sanitized, 10);
  const context = entities
    .map((e) => `[${e.type}] ${e.name}: ${e.summary ?? 'no summary'}`)
    .join('\n');
  w(await reasonAbout(ctx.router, context, sanitized));
}

export function statusAction(ctx: AppContext): void {
  const totalCost = ctx.audit.getTotalCost();
  w('Sauria Status');
  w('---');
  w(`Entities:     ${String(countRows(ctx.db, 'SELECT COUNT(*) AS c FROM entities'))}`);
  w(`Events:       ${String(countRows(ctx.db, 'SELECT COUNT(*) AS c FROM events'))}`);
  w(`Observations: ${String(countRows(ctx.db, 'SELECT COUNT(*) AS c FROM observations'))}`);
  w(
    `Active tasks: ${String(countRows(ctx.db, "SELECT COUNT(*) AS c FROM tasks WHERE status IN ('pending','active')"))}`,
  );
  w(`Total cost:   $${totalCost.toFixed(4)}`);
}

export async function focusAction(ctx: AppContext, entityName: string): Promise<void> {
  const name = sanitizeChannelInput(entityName);
  const entity = getEntityByName(ctx.db, name) ?? searchEntities(ctx.db, name)[0];
  if (!entity) {
    w(`Entity "${name}" not found.`);
    return;
  }
  const relations = getEntityRelations(ctx.db, entity.id);
  const timeline = getEntityTimeline(ctx.db, entity.id, 10);
  const context = [
    `Entity: ${entity.name} (${entity.type})`,
    `Summary: ${entity.summary ?? 'none'}`,
    `Relations: ${relations.map((r) => `${r.type}(${r.toEntityId})`).join(', ')}`,
    `Recent: ${timeline.map((e) => `${e.eventType}@${e.timestamp}`).join(', ')}`,
  ].join('\n');
  const analysis = await reasonAbout(ctx.router, context, `Deep analysis of ${entity.name}`);
  w(`${entity.name} (${entity.type})`);
  w(`Importance: ${String(entity.importanceScore)} | Mentions: ${String(entity.mentionCount)}`);
  w(`Summary: ${entity.summary ?? 'none'}`);
  w('');
  w(analysis);
}

export function entityAction(ctx: AppContext, entityName: string): void {
  const name = sanitizeChannelInput(entityName);
  const entity = getEntityByName(ctx.db, name) ?? searchEntities(ctx.db, name)[0];
  if (!entity) {
    w(`Entity "${name}" not found.`);
    return;
  }
  const relations = getEntityRelations(ctx.db, entity.id);
  const timeline = getEntityTimeline(ctx.db, entity.id, 5);
  w(`${entity.name} (${entity.type})`);
  w(`ID: ${entity.id}`);
  w(`Importance: ${String(entity.importanceScore)}`);
  w(`Mentions: ${String(entity.mentionCount)}`);
  w(`Summary: ${entity.summary ?? 'none'}`);
  if (entity.properties) w(`Properties: ${JSON.stringify(entity.properties)}`);
  w('');
  w(`Relations (${String(relations.length)}):`);
  for (const r of relations) w(`  ${r.type} -> ${r.toEntityId} (strength: ${String(r.strength)})`);
  w('');
  w(`Recent events (${String(timeline.length)}):`);
  for (const e of timeline) w(`  [${e.timestamp}] ${e.eventType} (${e.source})`);
}

export function upcomingAction(ctx: AppContext, hours: number): void {
  const deadlines = getUpcomingDeadlines(ctx.db, hours);
  if (deadlines.length === 0) {
    w(`No upcoming deadlines in the next ${String(hours)} hours.`);
    return;
  }
  w(`Upcoming (next ${String(hours)}h):`);
  for (const e of deadlines) w(`  [${e.timestamp}] ${e.eventType} (${e.source})`);
}

export function insightsAction(ctx: AppContext): void {
  const rows: unknown[] = ctx.db
    .prepare(
      "SELECT content, confidence, created_at FROM observations WHERE type = 'insight' ORDER BY created_at DESC LIMIT 10",
    )
    .all();
  if (rows.length === 0) {
    w('No insights generated yet.');
    return;
  }
  w('Recent Insights:');
  for (const row of rows) {
    const r = row as Record<string, unknown>;
    w(`  [${String(r['created_at'])}] (${String(r['confidence'])}) ${String(r['content'])}`);
  }
}

export function teachAction(ctx: AppContext, fact: string): void {
  const sanitized = sanitizeChannelInput(fact);
  ctx.audit.logAction('cli:teach_requested', { fact: sanitized });
  w(`Noted: "${sanitized}"`);
  w('This will be processed by the ingestion pipeline when the daemon is running.');
}

export function sourcesAction(ctx: AppContext): void {
  const serverNames = Object.keys(ctx.config.mcp.servers);
  if (serverNames.length === 0) {
    w('No MCP sources configured.');
    return;
  }
  w('Configured MCP Sources:');
  for (const name of serverNames) {
    const server = ctx.config.mcp.servers[name];
    if (!server) continue;
    w(
      `  ${name}: ${server.command} ${server.args.join(' ')} (interval: ${String(server.interval)}s)`,
    );
  }
}

export function auditAction(ctx: AppContext, count: number): void {
  const entries = ctx.audit.getRecentActions(count);
  if (entries.length === 0) {
    w('No audit entries.');
    return;
  }
  w(`Last ${String(entries.length)} audit entries:`);
  for (const entry of entries) {
    const cost = entry.costUsd !== null ? ` ($${entry.costUsd.toFixed(4)})` : '';
    const status = entry.success ? 'OK' : 'FAIL';
    w(`  [${entry.timestamp}] ${entry.action} [${status}]${cost}`);
  }
}

export function exportAction(ctx: AppContext): void {
  const data = {
    entities: ctx.db.prepare('SELECT * FROM entities').all(),
    relations: ctx.db.prepare('SELECT * FROM relations').all(),
    events: ctx.db.prepare('SELECT * FROM events').all(),
    observations: ctx.db.prepare('SELECT * FROM observations').all(),
    exportedAt: new Date().toISOString(),
  };
  w(JSON.stringify(data, null, 2));
}

export function purgeAction(ctx: AppContext): void {
  w('WARNING: This will delete all data. Use --confirm to proceed.');
  if (!process.argv.includes('--confirm')) return;
  ctx.db.exec('DELETE FROM embeddings');
  ctx.db.exec('DELETE FROM observations');
  ctx.db.exec('DELETE FROM events');
  ctx.db.exec('DELETE FROM relations');
  ctx.db.exec('DELETE FROM entities');
  ctx.db.exec('DELETE FROM tasks');
  ctx.audit.logAction('purge', { confirmedAt: new Date().toISOString() });
  w('All data purged.');
}
