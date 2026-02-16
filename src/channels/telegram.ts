import { Bot } from 'grammy';
import type { Context } from 'grammy';
import type BetterSqlite3 from 'better-sqlite3';
import type { ProactiveAlert } from '../engine/proactive.js';
import type { ModelRouter } from '../ai/router.js';
import type { AuditLogger } from '../security/audit.js';
import { sanitizeChannelInput } from '../security/sanitize.js';
import { createLimiter, SECURITY_LIMITS } from '../security/rate-limiter.js';
import { reasonAbout } from '../ai/reason.js';
import { searchByKeyword } from '../db/search.js';
import { getUpcomingDeadlines } from '../db/temporal.js';
import {
  getEntityByName,
  getEntityRelations,
  getEntityTimeline,
  searchEntities,
} from '../db/world-model.js';
import { formatAlert, type Channel } from './base.js';

export interface TelegramDeps {
  readonly token: string;
  readonly allowedUserIds: readonly number[];
  readonly db: BetterSqlite3.Database;
  readonly router: ModelRouter;
  readonly audit: AuditLogger;
}

function countRows(db: BetterSqlite3.Database, sql: string): number {
  const row = db.prepare(sql).get() as { c: number } | undefined;
  return row?.c ?? 0;
}

export class TelegramChannel implements Channel {
  readonly name = 'telegram';
  private readonly bot: Bot;
  private readonly allowedUsers: ReadonlySet<number>;
  private readonly limiter = createLimiter(
    'telegram',
    SECURITY_LIMITS.channels.maxInboundMessagesPerMinute,
    60_000,
  );
  private silenceUntil = 0;

  constructor(private readonly deps: TelegramDeps) {
    this.bot = new Bot(deps.token);
    this.allowedUsers = new Set(deps.allowedUserIds);
    this.setupMiddleware();
    this.setupCommands();
  }

  private setupMiddleware(): void {
    this.bot.use(async (ctx, next) => {
      if (!ctx.from?.id || !this.allowedUsers.has(ctx.from.id)) return;
      if (!this.limiter.tryConsume()) {
        await ctx.reply('Rate limit reached. Please wait a moment.');
        return;
      }
      await next();
    });
  }

  private setupCommands(): void {
    this.bot.command('start', (ctx) =>
      ctx.reply(
        'OpenWind is ready. Use /ask, /status, /entity, /upcoming, /insights, /teach, or /silence.',
      ),
    );
    this.bot.command('ask', async (ctx) => {
      if (!ctx.match) {
        await ctx.reply('Usage: /ask <question>');
        return;
      }
      await this.handleAsk(ctx, ctx.match);
    });
    this.bot.command('status', (ctx) => this.handleStatus(ctx));
    this.bot.command('entity', async (ctx) => {
      if (!ctx.match) {
        await ctx.reply('Usage: /entity <name>');
        return;
      }
      await this.handleEntity(ctx, ctx.match);
    });
    this.bot.command('upcoming', (ctx) =>
      this.handleUpcoming(ctx, parseInt(ctx.match || '24', 10) || 24),
    );
    this.bot.command('insights', (ctx) => this.handleInsights(ctx));
    this.bot.command('teach', async (ctx) => {
      if (!ctx.match) {
        await ctx.reply('Usage: /teach <fact>');
        return;
      }
      await this.handleTeach(ctx, ctx.match);
    });
    this.bot.command('silence', async (ctx) => {
      const hours = parseInt(ctx.match || '2', 10) || 2;
      this.silenceUntil = Date.now() + hours * 3_600_000;
      await ctx.reply(`Alerts silenced for ${String(hours)} hour(s).`);
    });
    this.bot.on('message:text', async (ctx) => {
      if (ctx.message.text.startsWith('/')) return;
      await this.handleAsk(ctx, ctx.message.text);
    });
  }

  private async handleAsk(ctx: Context, rawQuestion: string): Promise<void> {
    const { db, router, audit } = this.deps;
    const question = sanitizeChannelInput(rawQuestion);
    const entities = searchByKeyword(db, question, 10);
    const context = entities
      .map((e) => `[${e.type}] ${e.name}: ${e.summary ?? 'no summary'}`)
      .join('\n');
    const answer = await reasonAbout(router, context, question);
    audit.logAction('telegram:ask', { question, entityCount: entities.length });
    await ctx.reply(answer);
  }

  private async handleStatus(ctx: Context): Promise<void> {
    const { db } = this.deps;
    const lastRow = db.prepare('SELECT MAX(timestamp) AS ts FROM events').get() as
      | { ts: string | null }
      | undefined;
    const lines = [
      'OpenWind Status',
      `Entities: ${String(countRows(db, 'SELECT COUNT(*) AS c FROM entities'))}`,
      `Events: ${String(countRows(db, 'SELECT COUNT(*) AS c FROM events'))}`,
      `Last ingestion: ${lastRow?.ts ?? 'never'}`,
    ];
    await ctx.reply(lines.join('\n'));
  }

  private async handleEntity(ctx: Context, rawName: string): Promise<void> {
    const { db } = this.deps;
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

  private async handleUpcoming(ctx: Context, hours: number): Promise<void> {
    const deadlines = getUpcomingDeadlines(this.deps.db, hours);
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

  private async handleInsights(ctx: Context): Promise<void> {
    const rows: unknown[] = this.deps.db
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

  private async handleTeach(ctx: Context, rawFact: string): Promise<void> {
    const fact = sanitizeChannelInput(rawFact);
    this.deps.audit.logAction('telegram:teach_requested', { fact });
    await ctx.reply(`Noted: "${fact}"\nThis will be processed by the ingestion pipeline.`);
  }

  async start(): Promise<void> {
    this.deps.audit.logAction('telegram:start', {});
    this.bot.catch((err) => {
      this.deps.audit.logAction('telegram:error', { error: String(err) }, { success: false });
    });
    void this.bot.start();
  }

  async stop(): Promise<void> {
    this.deps.audit.logAction('telegram:stop', {});
    this.bot.stop();
  }

  async sendAlert(alert: ProactiveAlert): Promise<void> {
    if (Date.now() < this.silenceUntil) return;
    const text = formatAlert(alert);
    for (const userId of this.allowedUsers) {
      await this.bot.api.sendMessage(userId, text);
    }
  }
}
