import type { Context } from 'grammy';
import type BetterSqlite3 from 'better-sqlite3';
import type { ModelRouter } from '../ai/router.js';
import type { AuditLogger } from '../security/audit.js';
import type { IngestPipeline } from '../ingestion/pipeline.js';
import type { TranscriptionService } from './transcription.js';
import type { InboundMessage } from '../orchestrator/types.js';
import { sanitizeChannelInput } from '../security/sanitize.js';
import { secureFetch } from '../security/url-allowlist.js';
import { reasonAbout } from '../ai/reason.js';
import { searchByKeyword } from '../db/search.js';
import { scrubPII } from '../security/pii-scrubber.js';
import { getLogger } from '../utils/logger.js';

const TELEGRAM_FILE_API = 'https://api.telegram.org/file/bot';
const MAX_VOICE_BYTES = 20 * 1024 * 1024;

export async function ingestText(
  pipeline: IngestPipeline,
  audit: AuditLogger,
  text: string,
  source: string,
): Promise<void> {
  try {
    await pipeline.ingestEvent(source, {
      content: text,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    audit.logAction(
      'telegram:ingest_error',
      { source, error: String(error) },
      { success: false },
    );
  }
}

function buildInbound(
  nodeId: string,
  ctx: Context,
  ownerId: number | undefined,
  content: string,
  contentType: 'text' | 'voice',
): InboundMessage {
  const senderId = String(ctx.from?.id ?? 'unknown');
  const isOwner = Boolean(ownerId && ctx.from?.id === ownerId);
  return {
    sourceNodeId: nodeId,
    platform: 'telegram',
    senderId,
    senderIsOwner: isOwner,
    groupId: ctx.chat?.id ? String(ctx.chat.id) : null,
    content,
    contentType,
    timestamp: new Date().toISOString(),
  };
}

export async function handleTextMessage(
  ctx: Context,
  rawText: string,
  deps: {
    readonly pipeline: IngestPipeline;
    readonly audit: AuditLogger;
    readonly onInbound?: (message: InboundMessage) => void;
    readonly nodeId?: string;
    readonly ownerId?: number;
    readonly db: BetterSqlite3.Database;
    readonly router: ModelRouter;
    readonly instructions?: string;
  },
): Promise<void> {
  const text = sanitizeChannelInput(rawText);
  await ingestText(deps.pipeline, deps.audit, text, 'telegram:text');

  const { onInbound, nodeId, ownerId } = deps;
  if (onInbound && nodeId) {
    onInbound(buildInbound(nodeId, ctx, ownerId, text, 'text'));
    return;
  }

  await handleAsk(ctx, text, deps);
}

export async function handleVoice(
  ctx: Context,
  deps: {
    readonly token: string;
    readonly audit: AuditLogger;
    readonly transcription: TranscriptionService | null;
    readonly pipeline: IngestPipeline;
    readonly onInbound?: (message: InboundMessage) => void;
    readonly nodeId?: string;
    readonly ownerId?: number;
    readonly db: BetterSqlite3.Database;
    readonly router: ModelRouter;
    readonly instructions?: string;
  },
): Promise<void> {
  const { audit, transcription } = deps;

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
    const fileUrl = `${TELEGRAM_FILE_API}${deps.token}/${file.file_path}`;
    const response = await secureFetch(fileUrl);
    const oggBuffer = Buffer.from(await response.arrayBuffer());

    const text = await transcription.transcribeVoice(oggBuffer);
    audit.logAction('telegram:voice_transcribed', {
      duration: voice.duration,
      textLength: text.length,
    });

    await ingestText(deps.pipeline, audit, text, 'telegram:voice');

    const { onInbound, nodeId, ownerId } = deps;
    if (onInbound && nodeId) {
      onInbound(buildInbound(nodeId, ctx, ownerId, text, 'voice'));
      return;
    }

    await handleAsk(ctx, text, deps);
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    getLogger().error('Telegram voice processing failed', { error: errMsg });
    audit.logAction('telegram:voice_error', { error: errMsg }, { success: false });
    await ctx.reply('Failed to process voice message. Please try again.');
  }
}

export async function handleAsk(
  ctx: Context,
  rawQuestion: string,
  deps: {
    readonly db: BetterSqlite3.Database;
    readonly router: ModelRouter;
    readonly audit: AuditLogger;
    readonly instructions?: string;
  },
): Promise<void> {
  const { db, router, audit } = deps;
  const question = sanitizeChannelInput(rawQuestion);
  const entities = searchByKeyword(db, question, 10);
  const context = entities
    .map((e) => `[${e.type}] ${e.name}: ${e.summary ?? 'no summary'}`)
    .join('\n');
  try {
    const answer = await reasonAbout(router, context, question, deps.instructions);
    audit.logAction('telegram:ask', {
      question: scrubPII(question),
      entityCount: entities.length,
    });
    await ctx.reply(answer);
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    const errStack = error instanceof Error ? error.stack : '';
    getLogger().error('Telegram ask failed', { error: errMsg, stack: errStack });
    audit.logAction(
      'telegram:ask_error',
      { question: scrubPII(question), error: errMsg },
      { success: false },
    );
    await ctx.reply('Sorry, I could not process that request right now.');
  }
}

export async function handleTeach(
  ctx: Context,
  rawFact: string,
  deps: {
    readonly pipeline: IngestPipeline;
    readonly audit: AuditLogger;
  },
): Promise<void> {
  const fact = sanitizeChannelInput(rawFact);
  await ingestText(deps.pipeline, deps.audit, fact, 'telegram:teach');
  deps.audit.logAction('telegram:teach', { fact: scrubPII(fact) });
  await ctx.reply(`Learned: "${fact}"`);
}
