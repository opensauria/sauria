import type { AuditLogger } from '../security/audit.js';
import type { IngestPipeline } from '../ingestion/pipeline.js';
import type { InboundMessage } from '../orchestrator/types.js';
import { sanitizeChannelInput } from '../security/sanitize.js';
import type { ChannelGuards } from './base.js';

export interface DiscordMessage {
  readonly id: string;
  readonly author: {
    readonly id: string;
    readonly username: string;
    readonly bot?: boolean;
  };
  readonly content: string;
  readonly timestamp: string;
}

export interface DiscordApiChannel {
  readonly id: string;
  readonly type: number;
  readonly name?: string;
  readonly guild_id?: string;
}

export async function processInboundMessage(
  channelId: string,
  message: DiscordMessage,
  deps: {
    readonly audit: AuditLogger;
    readonly pipeline: IngestPipeline;
    readonly onInbound?: (message: InboundMessage) => void;
    readonly ownerId?: string;
    readonly nodeId?: string;
  },
  guards: ChannelGuards,
): Promise<void> {
  const { audit, pipeline, onInbound, ownerId, nodeId } = deps;
  const rawText = message.content;

  if (!rawText.trim()) return;

  if (!guards.tryConsume()) {
    audit.logAction('discord:rate_limited', {
      channelId,
      senderId: message.author.id,
    });
    return;
  }

  let sanitizedText: string;
  try {
    sanitizedText = sanitizeChannelInput(rawText);
  } catch (error) {
    audit.logAction(
      'discord:sanitize_error',
      { channelId, error: String(error) },
      { success: false },
    );
    return;
  }

  const isOwner = Boolean(ownerId && message.author.id === ownerId);

  try {
    await pipeline.ingestEvent('discord:message', {
      content: sanitizedText,
      timestamp: new Date().toISOString(),
      channelId,
      senderId: message.author.id,
    });
  } catch (error) {
    audit.logAction(
      'discord:ingest_error',
      { channelId, error: String(error) },
      { success: false },
    );
  }

  audit.logAction('discord:message_received', {
    channelId,
    senderId: message.author.id,
    isOwner,
    textLength: sanitizedText.length,
  });

  if (onInbound) {
    const inbound: InboundMessage = {
      sourceNodeId: nodeId ?? 'discord-default',
      platform: 'discord',
      senderId: message.author.id,
      senderIsOwner: isOwner,
      groupId: channelId,
      content: sanitizedText,
      contentType: 'text',
      timestamp: message.timestamp,
    };
    onInbound(inbound);
  }
}
