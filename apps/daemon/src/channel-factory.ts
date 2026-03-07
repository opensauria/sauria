import type BetterSqlite3 from 'better-sqlite3';
import type { Channel } from './channels/base.js';
import { TelegramChannel } from './channels/telegram.js';
import { SlackChannel } from './channels/slack.js';
import { DiscordChannel } from './channels/discord.js';
import { EmailChannel } from './channels/email.js';
import { TranscriptionService } from './channels/transcription.js';
import { IngestPipeline } from './ingestion/pipeline.js';
import { createLimiter, SECURITY_LIMITS } from './security/rate-limiter.js';
import { vaultGet } from './security/vault-key.js';
import { getLogger } from './utils/logger.js';
import type { ModelRouter } from './ai/router.js';
import type { AuditLogger } from './security/audit.js';
import type { SauriaConfig } from './config/schema.js';
import type { AgentNode, InboundMessage } from './orchestrator/types.js';

export interface ChannelNodeDeps {
  readonly db: BetterSqlite3.Database;
  readonly router: ModelRouter;
  readonly audit: AuditLogger;
  readonly config: SauriaConfig;
  readonly onInbound: (message: InboundMessage) => void;
  readonly globalInstructions: string;
}

export async function createChannelForNode(
  node: AgentNode,
  deps: ChannelNodeDeps,
): Promise<Channel | null> {
  const logger = getLogger();
  const { db, router, audit, config, onInbound, globalInstructions } = deps;

  const platformName = node.platform.charAt(0).toUpperCase() + node.platform.slice(1);
  const displayName = node.meta?.['firstName'] || node.label.replace(/^@/, '') || node.label;
  const personaBlock = [
    `Your name is ${displayName}.`,
    `You are a ${node.role ?? 'assistant'} agent on ${platformName}.`,
    `Always respond as ${displayName}. Never say you are Claude, an AI assistant, or a language model.`,
  ].join(' ');

  const combinedInstructions = [personaBlock, globalInstructions, node.instructions]
    .filter(Boolean)
    .join('\n\n');

  const nodeToken = await vaultGet(`channel_token_${node.id}`);

  if (node.platform === 'telegram') {
    const token = nodeToken;
    if (!token) {
      logger.warn(`Skipping node ${node.id}: no telegram token in vault`);
      return null;
    }

    const { voice } = config.channels.telegram;
    const transcription = voice.enabled
      ? new TranscriptionService({
          model: voice.model,
          maxDurationSeconds: voice.maxDurationSeconds,
        })
      : null;

    const pipeline = new IngestPipeline(
      db, router, audit,
      createLimiter(`tg_ingest_${node.id}`, SECURITY_LIMITS.ingestion.maxEventsPerHour, 3_600_000),
    );

    const ownerTelegramId = config.owner.telegram?.userId;
    const nodeUserId =
      typeof node.meta?.['userId'] === 'string' ? Number(node.meta['userId']) : undefined;
    const configUserIds = config.channels.telegram.allowedUserIds;
    const allowedUserIds =
      configUserIds.length > 0 ? configUserIds : nodeUserId ? [nodeUserId] : [];

    return new TelegramChannel({
      token, allowedUserIds, db, router, audit, pipeline, transcription,
      nodeId: node.id, ownerId: ownerTelegramId ?? nodeUserId, onInbound,
      instructions: combinedInstructions,
    });
  }

  if (node.platform === 'slack') {
    const token = nodeToken ?? (await vaultGet('slack_bot_token'));
    const signingSecret =
      (await vaultGet(`channel_signing_${node.id}`)) ?? (await vaultGet('slack_signing_secret'));

    if (!token || !signingSecret) {
      logger.warn(`Skipping node ${node.id}: no slack credentials in vault`);
      return null;
    }

    const pipeline = new IngestPipeline(
      db, router, audit,
      createLimiter(`slack_ingest_${node.id}`, SECURITY_LIMITS.ingestion.maxEventsPerHour, 3_600_000),
    );

    return new SlackChannel({
      token, signingSecret, channelIds: [], ownerId: config.owner.slack?.userId,
      nodeId: node.id, audit, pipeline, onInbound,
    });
  }

  if (node.platform === 'discord') {
    const token = nodeToken ?? (await vaultGet('discord_bot_token'));
    if (!token) {
      logger.warn(`Skipping node ${node.id}: no discord token in vault`);
      return null;
    }

    const pipeline = new IngestPipeline(
      db, router, audit,
      createLimiter(`discord_ingest_${node.id}`, SECURITY_LIMITS.ingestion.maxEventsPerHour, 3_600_000),
    );

    return new DiscordChannel({
      token, guildId: config.channels.discord.guildId, channelIds: [],
      ownerId: config.channels.discord.botUserId, nodeId: node.id, audit, pipeline, onInbound,
    });
  }

  if (node.platform === 'whatsapp') {
    const accessToken = nodeToken ?? (await vaultGet('whatsapp_access_token'));
    const verifyToken =
      (await vaultGet(`whatsapp_verify_token_${node.id}`)) ??
      (await vaultGet('whatsapp_verify_token'));
    const appSecret =
      (await vaultGet(`whatsapp_app_secret_${node.id}`)) ?? (await vaultGet('whatsapp_app_secret'));

    if (!accessToken || !verifyToken || !appSecret) {
      logger.warn(`Skipping node ${node.id}: incomplete whatsapp credentials`);
      return null;
    }

    const pipeline = new IngestPipeline(
      db, router, audit,
      createLimiter(`wa_ingest_${node.id}`, SECURITY_LIMITS.ingestion.maxEventsPerHour, 3_600_000),
    );

    const { WhatsAppChannel } = await import('./channels/whatsapp.js');
    return new WhatsAppChannel({
      accessToken, phoneNumberId: config.channels.whatsapp.phoneNumberId ?? '',
      webhookPort: config.channels.whatsapp.webhookPort ?? 9090,
      verifyToken, appSecret, audit, pipeline, onInbound,
    });
  }

  if (node.platform === 'email') {
    const password = nodeToken ?? (await vaultGet('email_password'));
    const emailConfig = config.channels.email;

    if (!password || !emailConfig.imapHost || !emailConfig.username) {
      logger.warn(`Skipping node ${node.id}: incomplete email credentials`);
      return null;
    }

    const pipeline = new IngestPipeline(
      db, router, audit,
      createLimiter(`email_ingest_${node.id}`, SECURITY_LIMITS.ingestion.maxEventsPerHour, 3_600_000),
    );

    return new EmailChannel({
      imapHost: emailConfig.imapHost, imapPort: emailConfig.imapPort,
      smtpHost: emailConfig.smtpHost ?? emailConfig.imapHost, smtpPort: emailConfig.smtpPort,
      username: emailConfig.username, password, tls: emailConfig.tls,
      nodeId: node.id, audit, pipeline, onInbound,
    });
  }

  logger.info(`Platform ${node.platform} on node ${node.id} not yet supported in daemon`);
  return null;
}
