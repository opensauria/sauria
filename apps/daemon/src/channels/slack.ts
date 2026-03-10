import type { ProactiveAlert } from '../engine/proactive.js';
import type { AuditLogger } from '../security/audit.js';
import type { IngestPipeline } from '../ingestion/pipeline.js';
import type { InboundMessage } from '../orchestrator/types.js';
import { secureFetch } from '../security/url-allowlist.js';
import { getLogger } from '../utils/logger.js';
import { ChannelGuards, PollController, formatAlert, type Channel } from './base.js';
import {
  processInboundMessage,
  type SlackApiResponse,
  type ConversationsHistoryResponse,
  type ChatPostMessageResponse,
} from './slack-handlers.js';

const SLACK_API_BASE = 'https://slack.com/api/';
const POLL_INTERVAL_MS = 3_000;
const FETCH_TIMEOUT_MS = 10_000;

interface ConversationsListResponse extends SlackApiResponse {
  readonly channels?: readonly { readonly id: string; readonly name?: string }[];
  readonly response_metadata?: { readonly next_cursor?: string };
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
  private readonly guards = new ChannelGuards('slack');
  private readonly poller = new PollController(POLL_INTERVAL_MS);
  private readonly latestTimestamps = new Map<string, string>();
  private resolvedChannelIds: string[] = [];

  constructor(private readonly deps: SlackDeps) {}

  async start(): Promise<void> {
    const { audit, channelIds } = this.deps;

    if (channelIds.length > 0) {
      this.resolvedChannelIds = [...channelIds];
    } else {
      this.resolvedChannelIds = await this.discoverBotChannels();
    }

    audit.logAction('slack:start', { channelIds: [...this.resolvedChannelIds] });

    for (const channelId of this.resolvedChannelIds) {
      await this.initializeChannelTimestamp(channelId);
    }
    this.poller.start(() => this.pollAllChannels());
  }

  async stop(): Promise<void> {
    this.deps.audit.logAction('slack:stop', {});
    this.poller.stop();
  }

  async sendAlert(alert: ProactiveAlert): Promise<void> {
    if (this.guards.isSilenced()) return;
    const text = formatAlert(alert);
    for (const channelId of this.resolvedChannelIds) {
      await this.postMessage(channelId, text);
    }
  }

  async sendMessage(content: string, groupId: string | null): Promise<void> {
    if (groupId) {
      await this.postMessage(groupId, content);
      return;
    }
    for (const channelId of this.resolvedChannelIds) {
      await this.postMessage(channelId, content);
    }
  }

  async sendToGroup(groupId: string, content: string): Promise<void> {
    await this.postMessage(groupId, content);
  }

  silenceFor(hours: number): void {
    this.guards.silence(hours);
  }

  /** Exposed for testing — triggers one poll cycle across all channels. */
  async pollOnce(): Promise<void> {
    await this.pollAllChannels();
  }

  private async discoverBotChannels(): Promise<string[]> {
    const { audit } = this.deps;
    const logger = getLogger();
    const discovered: string[] = [];
    let cursor = '';

    try {
      do {
        const params: Record<string, string> = {
          types: 'public_channel,private_channel',
          exclude_archived: 'true',
          limit: '200',
        };
        if (cursor) params['cursor'] = cursor;

        const response =
          await this.callSlackApi<ConversationsListResponse>('users.conversations', params);

        if (!response.ok) {
          audit.logAction(
            'slack:discover_channels_error',
            { error: response.error ?? 'unknown' },
            { success: false },
          );
          return discovered;
        }

        for (const channel of response.channels ?? []) {
          discovered.push(channel.id);
        }

        cursor = response.response_metadata?.next_cursor ?? '';
      } while (cursor);

      logger.info('Slack channels discovered', {
        nodeId: this.deps.nodeId ?? 'none',
        count: discovered.length,
      });
    } catch (error) {
      audit.logAction(
        'slack:discover_channels_error',
        { error: String(error) },
        { success: false },
      );
    }

    return discovered;
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

  private async pollAllChannels(): Promise<void> {
    for (const channelId of this.resolvedChannelIds) {
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
      const sorted = [...messages].sort((a, b) => parseFloat(a.ts) - parseFloat(b.ts));
      for (const message of sorted) {
        if (message.ts === oldest) continue;
        if (message.bot_id || message.subtype) continue;
        await processInboundMessage(channelId, message, this.deps, this.guards);
      }
      const newest = sorted[sorted.length - 1];
      if (newest && parseFloat(newest.ts) > parseFloat(oldest)) {
        this.latestTimestamps.set(channelId, newest.ts);
      }
    } catch (error) {
      audit.logAction('slack:poll_error', { channelId, error: String(error) }, { success: false });
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
      audit.logAction('slack:message_sent', { channelId, textLength: text.length });
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
      const response = await secureFetch(url, {
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
