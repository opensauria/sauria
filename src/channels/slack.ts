import type { ProactiveAlert } from '../engine/proactive.js';
import type { AuditLogger } from '../security/audit.js';
import type { IngestPipeline } from '../ingestion/pipeline.js';
import type { InboundMessage } from '../orchestrator/types.js';
import { sanitizeChannelInput } from '../security/sanitize.js';
import { createLimiter, SECURITY_LIMITS } from '../security/rate-limiter.js';
import { formatAlert, type Channel } from './base.js';

const SLACK_API_BASE = 'https://slack.com/api/';
const POLL_INTERVAL_MS = 3_000;
const FETCH_TIMEOUT_MS = 10_000;

interface SlackApiResponse {
  readonly ok: boolean;
  readonly error?: string;
}

interface SlackMessage {
  readonly ts: string;
  readonly user?: string;
  readonly text?: string;
  readonly bot_id?: string;
  readonly subtype?: string;
}

interface ConversationsHistoryResponse extends SlackApiResponse {
  readonly messages?: readonly SlackMessage[];
}

interface ChatPostMessageResponse extends SlackApiResponse {
  readonly ts?: string;
  readonly channel?: string;
}

export interface SlackDeps {
  readonly token: string;
  readonly signingSecret: string;
  readonly channelIds: readonly string[];
  readonly ownerId?: string;
  readonly nodeId?: string;
  readonly audit: AuditLogger;
  readonly pipeline: IngestPipeline;
  readonly onInbound?: (message: InboundMessage) => void;
}

export class SlackChannel implements Channel {
  readonly name = 'slack';
  private readonly limiter = createLimiter(
    'slack',
    SECURITY_LIMITS.channels.maxInboundMessagesPerMinute,
    60_000,
  );
  private readonly latestTimestamps = new Map<string, string>();
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private silenceUntil = 0;

  constructor(private readonly deps: SlackDeps) {}

  async start(): Promise<void> {
    const { audit, channelIds } = this.deps;
    audit.logAction('slack:start', { channelIds: [...channelIds] });

    for (const channelId of channelIds) {
      await this.initializeChannelTimestamp(channelId);
    }

    this.stopped = false;
    this.schedulePoll();
  }

  async stop(): Promise<void> {
    this.deps.audit.logAction('slack:stop', {});
    this.stopped = true;

    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private schedulePoll(): void {
    if (this.stopped) return;
    this.pollTimer = setTimeout(async () => {
      await this.pollAllChannels();
      this.schedulePoll();
    }, POLL_INTERVAL_MS);
  }

  async sendAlert(alert: ProactiveAlert): Promise<void> {
    if (Date.now() < this.silenceUntil) return;

    const text = formatAlert(alert);
    for (const channelId of this.deps.channelIds) {
      await this.postMessage(channelId, text);
    }
  }

  async sendMessage(content: string, groupId: string | null): Promise<void> {
    if (groupId) {
      await this.postMessage(groupId, content);
      return;
    }

    for (const channelId of this.deps.channelIds) {
      await this.postMessage(channelId, content);
    }
  }

  async sendToGroup(groupId: string, content: string): Promise<void> {
    await this.postMessage(groupId, content);
  }

  silenceFor(hours: number): void {
    this.silenceUntil = Date.now() + hours * 3_600_000;
  }

  private async initializeChannelTimestamp(channelId: string): Promise<void> {
    const { audit } = this.deps;

    try {
      const response = await this.callSlackApi<ConversationsHistoryResponse>(
        'conversations.history',
        { channel: channelId, limit: '1' },
      );

      if (!response.ok) {
        audit.logAction(
          'slack:init_channel_error',
          { channelId, error: response.error ?? 'unknown' },
          { success: false },
        );
        return;
      }

      const latestMessage = response.messages?.[0];
      this.latestTimestamps.set(channelId, latestMessage?.ts ?? '0');
    } catch (error) {
      audit.logAction(
        'slack:init_channel_error',
        { channelId, error: String(error) },
        { success: false },
      );
      this.latestTimestamps.set(channelId, '0');
    }
  }

  /** Exposed for testing — triggers one poll cycle across all channels. */
  async pollOnce(): Promise<void> {
    await this.pollAllChannels();
  }

  private async pollAllChannels(): Promise<void> {
    for (const channelId of this.deps.channelIds) {
      await this.pollChannel(channelId);
    }
  }

  private async pollChannel(channelId: string): Promise<void> {
    const { audit } = this.deps;
    const oldest = this.latestTimestamps.get(channelId) ?? '0';

    try {
      const response = await this.callSlackApi<ConversationsHistoryResponse>(
        'conversations.history',
        { channel: channelId, oldest, limit: '20' },
      );

      if (!response.ok) {
        audit.logAction(
          'slack:poll_error',
          { channelId, error: response.error ?? 'unknown' },
          { success: false },
        );
        return;
      }

      const messages = response.messages ?? [];
      if (messages.length === 0) return;

      const sorted = [...messages].sort((a, b) => {
        return parseFloat(a.ts) - parseFloat(b.ts);
      });

      for (const message of sorted) {
        if (message.ts === oldest) continue;
        if (message.bot_id || message.subtype) continue;

        await this.processInboundMessage(channelId, message);
      }

      const newest = sorted[sorted.length - 1];
      if (newest && parseFloat(newest.ts) > parseFloat(oldest)) {
        this.latestTimestamps.set(channelId, newest.ts);
      }
    } catch (error) {
      audit.logAction('slack:poll_error', { channelId, error: String(error) }, { success: false });
    }
  }

  private async processInboundMessage(channelId: string, message: SlackMessage): Promise<void> {
    const { audit, pipeline, onInbound, ownerId, nodeId } = this.deps;
    const rawText = message.text ?? '';

    if (!rawText.trim()) return;

    if (!this.limiter.tryConsume()) {
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

  private async postMessage(
    channelId: string,
    text: string,
  ): Promise<ChatPostMessageResponse | null> {
    const { audit } = this.deps;

    try {
      const response = await this.callSlackApi<ChatPostMessageResponse>('chat.postMessage', {
        channel: channelId,
        text,
      });

      if (!response.ok) {
        audit.logAction(
          'slack:send_error',
          { channelId, error: response.error ?? 'unknown' },
          { success: false },
        );
        return null;
      }

      audit.logAction('slack:message_sent', {
        channelId,
        textLength: text.length,
      });

      return response;
    } catch (error) {
      audit.logAction('slack:send_error', { channelId, error: String(error) }, { success: false });
      return null;
    }
  }

  private async callSlackApi<T extends SlackApiResponse>(
    method: string,
    params: Record<string, string>,
  ): Promise<T> {
    const { token } = this.deps;
    const url = `${SLACK_API_BASE}${method}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify(params),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Slack API HTTP error: ${String(response.status)}`);
      }

      return (await response.json()) as T;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
