import { Bot } from 'grammy';
import type BetterSqlite3 from 'better-sqlite3';
import type { ProactiveAlert } from '../engine/proactive.js';
import type { ModelRouter } from '../ai/router.js';
import type { AuditLogger } from '../security/audit.js';
import type { IngestPipeline } from '../ingestion/pipeline.js';
import type { TranscriptionService } from './transcription.js';
import type { InboundMessage } from '../orchestrator/types.js';
import { ChannelGuards, formatAlert, type Channel } from './base.js';
import { getLogger } from '../utils/logger.js';
import {
  handleTextMessage,
  handleVoice,
  handleAsk,
  handleTeach,
} from './telegram-handlers.js';
import {
  handleStatus,
  handleEntity,
  handleUpcoming,
  handleInsights,
} from './telegram-queries.js';

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

export class TelegramChannel implements Channel {
  readonly name = 'telegram';
  private readonly bot: Bot;
  private readonly allowedUsers: ReadonlySet<number>;
  private readonly guards = new ChannelGuards('telegram');

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
        getLogger().warn('Rejected unauthorized Telegram user', {
          userId: String(fromId),
          allowed: [...this.allowedUsers],
        });
        return;
      }
      if (!this.guards.tryConsume()) {
        await ctx.reply('Rate limit reached. Please wait a moment.');
        return;
      }
      await next();
    });
  }

  private setupCommands(): void {
    this.bot.command('start', (ctx) =>
      ctx.reply(
        'Sauria is ready. Use /ask, /status, /entity, /upcoming, /insights, /teach, or /silence.',
      ),
    );
    this.bot.command('ask', async (ctx) => {
      if (!ctx.match) {
        await ctx.reply('Usage: /ask <question>');
        return;
      }
      await handleAsk(ctx, ctx.match, this.deps);
    });
    this.bot.command('status', (ctx) => handleStatus(ctx, this.deps.db));
    this.bot.command('entity', async (ctx) => {
      if (!ctx.match) {
        await ctx.reply('Usage: /entity <name>');
        return;
      }
      await handleEntity(ctx, ctx.match, this.deps.db);
    });
    this.bot.command('upcoming', (ctx) =>
      handleUpcoming(ctx, parseInt(ctx.match || '24', 10) || 24, this.deps.db),
    );
    this.bot.command('insights', (ctx) => handleInsights(ctx, this.deps.db));
    this.bot.command('teach', async (ctx) => {
      if (!ctx.match) {
        await ctx.reply('Usage: /teach <fact>');
        return;
      }
      await handleTeach(ctx, ctx.match, this.deps);
    });
    this.bot.command('silence', async (ctx) => {
      const hours = parseInt(ctx.match || '2', 10) || 2;
      this.guards.silence(hours);
      await ctx.reply(`Alerts silenced for ${String(hours)} hour(s).`);
    });

    this.bot.on('message:voice', (ctx) => handleVoice(ctx, this.deps));

    this.bot.on('message:text', async (ctx) => {
      if (ctx.message.text.startsWith('/')) return;
      await handleTextMessage(ctx, ctx.message.text, this.deps);
    });
  }

  async start(): Promise<void> {
    this.deps.audit.logAction('telegram:start', {});
    const logger = getLogger();
    logger.info('Telegram channel starting', {
      nodeId: this.deps.nodeId ?? 'none',
      allowedUsers: [...this.allowedUsers],
    });
    this.bot.catch((err) => {
      logger.error('Telegram bot error', { error: String(err) });
      this.deps.audit.logAction('telegram:error', { error: String(err) }, { success: false });
    });
    void this.bot.start({
      onStart: () => {
        logger.info('Telegram bot polling started', {
          nodeId: this.deps.nodeId ?? 'none',
        });
      },
    });
  }

  async stop(): Promise<void> {
    this.deps.audit.logAction('telegram:stop', {});
    this.bot.stop();
  }

  async sendAlert(alert: ProactiveAlert): Promise<void> {
    if (this.guards.isSilenced()) return;
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
