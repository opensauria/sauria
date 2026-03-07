import type { AuditLogger } from '../security/audit.js';
import type { IngestPipeline } from '../ingestion/pipeline.js';
import type { InboundMessage } from '../orchestrator/types.js';
import { sanitizeChannelInput } from '../security/sanitize.js';
import type { ChannelGuards } from './base.js';

export interface SlackMessage {
  readonly ts: string;
  readonly user?: string;
  readonly text?: string;
  readonly bot_id?: string;
  readonly subtype?: string;
}

export interface SlackApiResponse {
  readonly ok: boolean;
  readonly error?: string;
}

export interface ConversationsHistoryResponse extends SlackApiResponse {
  readonly messages?: readonly SlackMessage[];
}

export interface ChatPostMessageResponse extends SlackApiResponse {
  readonly ts?: string;
  readonly channel?: string;
}

export async function processInboundMessage(
  channelId: string,
  message: SlackMessage,
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
  const rawText = message.text ?? '';

  if (!rawText.trim()) return;

  if (!guards.tryConsume()) {
    audit.logAction('slack:rate_limited', {
      channelId,
      senderId: message.user ?? 'unknown',
    });
    return;
  }

  let sanitizedText: string;
  try {
    sanitizedText = sanitizeChannelInput(rawText);
  } catch (error) {
    audit.logAction(
      'slack:sanitize_error',
      { channelId, error: String(error) },
      { success: false },
    );
    return;
  }

  const isOwner = Boolean(ownerId && message.user === ownerId);

  try {
    await pipeline.ingestEvent('slack:message', {
      content: sanitizedText,
      timestamp: new Date().toISOString(),
      channelId,
      senderId: message.user ?? 'unknown',
    });
  } catch (error) {
    audit.logAction(
      'slack:ingest_error',
      { channelId, error: String(error) },
      { success: false },
    );
  }

  audit.logAction('slack:message_received', {
    channelId,
    senderId: message.user ?? 'unknown',
    isOwner,
    textLength: sanitizedText.length,
  });

  if (onInbound) {
    const inbound: InboundMessage = {
      sourceNodeId: nodeId ?? 'slack-default',
      platform: 'slack',
      senderId: message.user ?? 'unknown',
      senderIsOwner: isOwner,
      groupId: channelId,
      content: sanitizedText,
      contentType: 'text',
      timestamp: new Date(parseFloat(message.ts) * 1_000).toISOString(),
    };
    onInbound(inbound);
  }
}
