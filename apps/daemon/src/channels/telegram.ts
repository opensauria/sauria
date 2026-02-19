import { Bot } from 'grammy';
import type { Context } from 'grammy';
import type BetterSqlite3 from 'better-sqlite3';
import type { ProactiveAlert } from '../engine/proactive.js';
import type { ModelRouter } from '../ai/router.js';
import type { AuditLogger } from '../security/audit.js';
import type { IngestPipeline } from '../ingestion/pipeline.js';
import type { TranscriptionService } from './transcription.js';
import type { InboundMessage } from '../orchestrator/types.js';
import { sanitizeChannelInput } from '../security/sanitize.js';
import { secureFetch } from '../security/url-allowlist.js';
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
import { scrubPII } from '../security/pii-scrubber.js';
import { formatAlert, type Channel } from './base.js';

const TELEGRAM_FILE_API = 'https://api.telegram.org/file/bot';
const MAX_VOICE_BYTES = 20 * 1024 * 1024;

export interface TelegramDeps {
  readonly token: string;
  readonly allowedUserIds: readonly number[];
  readonly db: BetterSqlite3.Database;
  readonly router: ModelRouter;
  readonly audit: AuditLogger;
  readonly pipeline: IngestPipeline;
  readonly transcription: TranscriptionService | null;
  readonly nodeId?: string;
  readonly ownerId?: number;
  readonly onInbound?: (message: InboundMessage) => void;
  readonly instructions?: string;
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
      const fromId = ctx.from?.id;
      if (!fromId || !this.allowedUsers.has(fromId)) {
        process.stderr.write(
          `[telegram:auth] Rejected user ${String(fromId)} — allowed: [${[...this.allowedUsers].join(',')}]\n`,
        );
        return;
      }
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
        'OpenSauria is ready. Use /ask, /status, /entity, /upcoming, /insights, /teach, or /silence.',
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

    this.bot.on('message:voice', (ctx) => this.handleVoice(ctx));

    this.bot.on('message:text', async (ctx) => {
      if (ctx.message.text.startsWith('/')) return;
      await this.handleTextMessage(ctx, ctx.message.text);
    });
  }

  private async handleTextMessage(ctx: Context, rawText: string): Promise<void> {
    const text = sanitizeChannelInput(rawText);
    await this.ingestText(text, 'telegram:text');

    const { onInbound, nodeId, ownerId } = this.deps;
    if (onInbound && nodeId) {
      const senderId = String(ctx.from?.id ?? 'unknown');
      const isOwner = Boolean(ownerId && ctx.from?.id === ownerId);
      const inbound: InboundMessage = {
        sourceNodeId: nodeId,
        platform: 'telegram',
        senderId,
        senderIsOwner: isOwner,
        groupId: ctx.chat?.id ? String(ctx.chat.id) : null,
        content: text,
        contentType: 'text',
        timestamp: new Date().toISOString(),
      };
      onInbound(inbound);
      return;
    }

    // Legacy single-bot mode: no orchestrator, respond directly
    await this.handleAsk(ctx, text);
  }

  private async handleVoice(ctx: Context): Promise<void> {
    const { audit, transcription } = this.deps;

    if (!transcription) {
      await ctx.reply('Voice transcription is not enabled.');
      return;
    }

    const voice = ctx.message?.voice;
    if (!voice) return;

    if (voice.file_size && voice.file_size > MAX_VOICE_BYTES) {
      await ctx.reply('Voice message too large (max 20 MB).');
      return;
    }

    await ctx.reply('Transcribing...');

    try {
      const file = await ctx.getFile();
      const fileUrl = `${TELEGRAM_FILE_API}${this.deps.token}/${file.file_path}`;
      const response = await secureFetch(fileUrl);
      const oggBuffer = Buffer.from(await response.arrayBuffer());

      const text = await transcription.transcribeVoice(oggBuffer);
      audit.logAction('telegram:voice_transcribed', {
        duration: voice.duration,
        textLength: text.length,
      });

      await this.ingestText(text, 'telegram:voice');

      const { onInbound, nodeId, ownerId } = this.deps;
      if (onInbound && nodeId) {
        const senderId = String(ctx.from?.id ?? 'unknown');
        const isOwner = Boolean(ownerId && ctx.from?.id === ownerId);
        const inbound: InboundMessage = {
          sourceNodeId: nodeId,
          platform: 'telegram',
          senderId,
          senderIsOwner: isOwner,
          groupId: ctx.chat?.id ? String(ctx.chat.id) : null,
          content: text,
          contentType: 'voice',
          timestamp: new Date().toISOString(),
        };
        onInbound(inbound);
        return;
      }

      // Legacy single-bot mode: no orchestrator, respond directly
      await this.handleAsk(ctx, text);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      process.stderr.write(`[telegram:voice_error] ${errMsg}\n`);
      audit.logAction('telegram:voice_error', { error: errMsg }, { success: false });
      await ctx.reply('Failed to process voice message. Please try again.');
    }
  }

  private async ingestText(text: string, source: string): Promise<void> {
    const { pipeline, audit } = this.deps;
    try {
      await pipeline.ingestEvent(source, {
        content: text,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      audit.logAction(
        'telegram:ingest_error',
        {
          source,
          error: String(error),
        },
        { success: false },
      );
    }
  }

  private async handleAsk(ctx: Context, rawQuestion: string): Promise<void> {
    const { db, router, audit } = this.deps;
    const question = sanitizeChannelInput(rawQuestion);
    const entities = searchByKeyword(db, question, 10);
    const context = entities
      .map((e) => `[${e.type}] ${e.name}: ${e.summary ?? 'no summary'}`)
      .join('\n');
    try {
      const answer = await reasonAbout(router, context, question, this.deps.instructions);
      audit.logAction('telegram:ask', {
        question: scrubPII(question),
        entityCount: entities.length,
      });
      await ctx.reply(answer);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      const errStack = error instanceof Error ? error.stack : '';
      process.stderr.write(`[telegram:ask_error] ${errMsg}\n${errStack}\n`);
      audit.logAction(
        'telegram:ask_error',
        {
          question: scrubPII(question),
          error: errMsg,
        },
        { success: false },
      );
      await ctx.reply('Sorry, I could not process that request right now.');
    }
  }

  private async handleStatus(ctx: Context): Promise<void> {
    const { db } = this.deps;
    const lastRow = db.prepare('SELECT MAX(timestamp) AS ts FROM events').get() as
      | { ts: string | null }
      | undefined;
    const lines = [
      'OpenSauria Status',
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
    await this.ingestText(fact, 'telegram:teach');
    this.deps.audit.logAction('telegram:teach', { fact: scrubPII(fact) });
    await ctx.reply(`Learned: "${fact}"`);
  }

  async start(): Promise<void> {
    this.deps.audit.logAction('telegram:start', {});
    process.stderr.write(
      `[telegram:start] nodeId=${this.deps.nodeId ?? 'none'} allowedUsers=[${[...this.allowedUsers].join(',')}]\n`,
    );
    this.bot.catch((err) => {
      process.stderr.write(`[telegram:bot_error] ${String(err)}\n`);
      this.deps.audit.logAction('telegram:error', { error: String(err) }, { success: false });
    });
    void this.bot.start({
      onStart: () => {
        process.stderr.write(
          `[telegram:polling] Bot polling started for nodeId=${this.deps.nodeId ?? 'none'}\n`,
        );
      },
    });
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

  async sendMessage(content: string, groupId: string | null): Promise<void> {
    if (groupId) {
      await this.bot.api.sendMessage(Number(groupId), content);
    } else {
      for (const userId of this.allowedUsers) {
        await this.bot.api.sendMessage(userId, content);
      }
    }
  }

  async sendToGroup(groupId: string, content: string): Promise<void> {
    await this.bot.api.sendMessage(Number(groupId), content);
  }
}
