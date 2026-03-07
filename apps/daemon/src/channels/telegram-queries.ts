import type { Context } from 'grammy';
import type BetterSqlite3 from 'better-sqlite3';
import { sanitizeChannelInput } from '../security/sanitize.js';
import { getUpcomingDeadlines } from '../db/temporal.js';
import {
  getEntityByName,
  getEntityRelations,
  getEntityTimeline,
  searchEntities,
} from '../db/world-model.js';

export function countRows(db: BetterSqlite3.Database, sql: string): number {
  const row = db.prepare(sql).get() as { c: number } | undefined;
  return row?.c ?? 0;
}

export async function handleStatus(
  ctx: Context,
  db: BetterSqlite3.Database,
): Promise<void> {
  const lastRow = db.prepare('SELECT MAX(timestamp) AS ts FROM events').get() as
    | { ts: string | null }
    | undefined;
  const lines = [
    'Sauria Status',
    `Entities: ${String(countRows(db, 'SELECT COUNT(*) AS c FROM entities'))}`,
    `Events: ${String(countRows(db, 'SELECT COUNT(*) AS c FROM events'))}`,
    `Last ingestion: ${lastRow?.ts ?? 'never'}`,
  ];
  await ctx.reply(lines.join('\n'));
}

export async function handleEntity(
  ctx: Context,
  rawName: string,
  db: BetterSqlite3.Database,
): Promise<void> {
  const name = sanitizeChannelInput(rawName);
  const entity = getEntityByName(db, name) ?? searchEntities(db, name)[0];
  if (!entity) {
    await ctx.reply(`Entity "${name}" not found.`);
    return;
  }
  const relations = getEntityRelations(db, entity.id);
  const timeline = getEntityTimeline(db, entity.id, 5);
  const lines = [
    `${entity.name} (${entity.type})`,
    entity.summary ?? '',
    '',
    `Relations (${String(relations.length)}):`,
    ...relations.slice(0, 5).map((r) => `  ${r.type} -> ${r.toEntityId}`),
    '',
    `Recent events (${String(timeline.length)}):`,
    ...timeline.map((e) => `  [${e.timestamp}] ${e.eventType}`),
  ];
  await ctx.reply(lines.join('\n'));
}

export async function handleUpcoming(
  ctx: Context,
  hours: number,
  db: BetterSqlite3.Database,
): Promise<void> {
  const deadlines = getUpcomingDeadlines(db, hours);
  if (deadlines.length === 0) {
    await ctx.reply(`No upcoming deadlines in the next ${String(hours)} hours.`);
    return;
  }
  const lines = [
    `Upcoming (next ${String(hours)}h):`,
    ...deadlines.map((e) => `  [${e.timestamp}] ${e.eventType}`),
  ];
  await ctx.reply(lines.join('\n'));
}

export async function handleInsights(
  ctx: Context,
  db: BetterSqlite3.Database,
): Promise<void> {
  const rows: unknown[] = db
    .prepare(
      "SELECT content, created_at FROM observations WHERE type = 'insight' ORDER BY created_at DESC LIMIT 5",
    )
    .all();
  if (rows.length === 0) {
    await ctx.reply('No insights generated yet.');
    return;
  }
  const lines = ['Recent Insights:'];
  for (const row of rows) {
    const r = row as Record<string, unknown>;
    lines.push(`  [${String(r['created_at'])}] ${String(r['content'])}`);
  }
  await ctx.reply(lines.join('\n'));
}
