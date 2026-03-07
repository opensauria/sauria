import type { ProactiveAlert } from '../engine/proactive.js';
import type { AuditLogger } from '../security/audit.js';
import type { IngestPipeline } from '../ingestion/pipeline.js';
import type { InboundMessage } from '../orchestrator/types.js';
import { secureFetch } from '../security/url-allowlist.js';
import { ChannelGuards, PollController, formatAlert, type Channel } from './base.js';
import {
  processInboundMessage,
  type DiscordMessage,
  type DiscordApiChannel,
} from './discord-handlers.js';

const DISCORD_API_BASE = 'https://discord.com/api/v10';
const POLL_INTERVAL_MS = 3_000;
const FETCH_TIMEOUT_MS = 10_000;

export interface DiscordDeps {
  readonly token: string;
  readonly guildId?: string;
  readonly channelIds: readonly string[];
  readonly nodeId?: string;
  readonly ownerId?: string;
  readonly audit: AuditLogger;
  readonly pipeline: IngestPipeline;
  readonly onInbound?: (message: InboundMessage) => void;
}

export class DiscordChannel implements Channel {
  readonly name = 'discord';
  private readonly guards = new ChannelGuards('discord');
  private readonly poller = new PollController(POLL_INTERVAL_MS);
  private readonly latestMessageIds = new Map<string, string>();
  private resolvedChannelIds: string[] = [];

  constructor(private readonly deps: DiscordDeps) {}

  async start(): Promise<void> {
    const { audit, channelIds, guildId } = this.deps;
    audit.logAction('discord:start', { guildId, channelIds: [...channelIds] });
    if (channelIds.length === 0 && guildId) {
      this.resolvedChannelIds = await this.resolveGuildTextChannels(guildId);
    } else {
      this.resolvedChannelIds = [...channelIds];
    }
    for (const channelId of this.resolvedChannelIds) {
      await this.initializeChannelTimestamp(channelId);
    }
    this.poller.start(() => this.pollAllChannels());
  }

  async stop(): Promise<void> {
    this.deps.audit.logAction('discord:stop', {});
    this.poller.stop();
  }

  async sendAlert(alert: ProactiveAlert): Promise<void> {
    if (this.guards.isSilenced()) return;
    const text = formatAlert(alert);
    const firstChannel = this.resolvedChannelIds[0];
    if (firstChannel) {
      await this.postMessage(firstChannel, text);
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

  /** Exposed for testing -- triggers one poll cycle across all channels. */
  async pollOnce(): Promise<void> {
    await this.pollAllChannels();
  }

  private async resolveGuildTextChannels(guildId: string): Promise<string[]> {
    const { audit } = this.deps;
    try {
      const response = await this.discordFetch<DiscordApiChannel[]>(`/guilds/${guildId}/channels`);
      return response.filter((c) => c.type === 0).map((c) => c.id);
    } catch (error) {
      audit.logAction(
        'discord:resolve_channels_error',
        { guildId, error: String(error) },
        { success: false },
      );
      return [];
    }
  }

  private async initializeChannelTimestamp(channelId: string): Promise<void> {
    const { audit } = this.deps;
    try {
      const messages = await this.discordFetch<DiscordMessage[]>(
        `/channels/${channelId}/messages?limit=1`,
      );
      const latest = messages[0];
      this.latestMessageIds.set(channelId, latest?.id ?? '0');
    } catch (error) {
      audit.logAction(
        'discord:init_channel_error',
        { channelId, error: String(error) },
        { success: false },
      );
      this.latestMessageIds.set(channelId, '0');
    }
  }

  private async pollAllChannels(): Promise<void> {
    for (const channelId of this.resolvedChannelIds) {
      await this.pollChannel(channelId);
    }
  }

  private async pollChannel(channelId: string): Promise<void> {
    const { audit } = this.deps;
    const afterId = this.latestMessageIds.get(channelId) ?? '0';
    try {
      const url =
        afterId === '0'
          ? `/channels/${channelId}/messages?limit=20`
          : `/channels/${channelId}/messages?after=${afterId}&limit=20`;
      const messages = await this.discordFetch<DiscordMessage[]>(url);
      if (messages.length === 0) return;

      const sorted = [...messages].reverse();
      for (const msg of sorted) {
        if (msg.author.bot) continue;
        await processInboundMessage(channelId, msg, this.deps, this.guards);
      }
      const newest = messages[0];
      if (newest) {
        this.latestMessageIds.set(channelId, newest.id);
      }
    } catch (error) {
      audit.logAction(
        'discord:poll_error',
        { channelId, error: String(error) },
        { success: false },
      );
    }
  }

  private async postMessage(channelId: string, text: string): Promise<void> {
    const { audit } = this.deps;
    try {
      await this.discordFetch<unknown>(`/channels/${channelId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content: text }),
      });
      audit.logAction('discord:message_sent', { channelId, textLength: text.length });
    } catch (error) {
      audit.logAction(
        'discord:send_error',
        { channelId, error: String(error) },
        { success: false },
      );
    }
  }

  private async discordFetch<T>(
    path: string,
    init?: { method?: string; body?: string },
  ): Promise<T> {
    const { token } = this.deps;
    const url = `${DISCORD_API_BASE}${path}`;
    const response = await secureFetch(url, {
      method: init?.method ?? 'GET',
      headers: {
        Authorization: `Bot ${token}`,
        'Content-Type': 'application/json',
      },
      body: init?.body,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`Discord API error: ${String(response.status)}`);
    }
    return (await response.json()) as T;
  }
}
