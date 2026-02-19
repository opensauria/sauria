import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DiscordChannel } from '../discord.js';
import type { DiscordDeps } from '../discord.js';
import type { AuditLogger } from '../../security/audit.js';
import type { IngestPipeline } from '../../ingestion/pipeline.js';
import type { InboundMessage } from '../../orchestrator/types.js';

function mockAudit(): AuditLogger {
  return {
    logAction: vi.fn(),
    hashContent: vi.fn().mockReturnValue('hash'),
  } as unknown as AuditLogger;
}

function mockPipeline(): IngestPipeline {
  return {
    ingestEvent: vi.fn().mockResolvedValue(undefined),
  } as unknown as IngestPipeline;
}

// Mock Discord API responses
const mockMessages = [
  {
    id: '200',
    author: { id: 'user1', username: 'TestUser', bot: false },
    content: 'Hello from Discord',
    timestamp: '2024-01-01T00:00:00Z',
  },
];

function createMockFetch(responses: Map<string, unknown>) {
  return vi.fn().mockImplementation((url: string) => {
    for (const [pattern, data] of responses) {
      if (url.includes(pattern)) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(data),
        });
      }
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve([]),
    });
  });
}

describe('DiscordChannel', () => {
  let channel: DiscordChannel;
  let audit: AuditLogger;
  let pipeline: IngestPipeline;
  let onInbound: (message: InboundMessage) => void;
  let originalFetch: typeof globalThis.fetch;

  const baseDeps: Omit<DiscordDeps, 'audit' | 'pipeline' | 'onInbound'> = {
    token: 'test-token',
    guildId: 'guild-123',
    channelIds: ['ch-1'],
    nodeId: 'node-discord',
    ownerId: 'ceo-user',
  };

  beforeEach(() => {
    audit = mockAudit();
    pipeline = mockPipeline();
    onInbound = vi.fn<(message: InboundMessage) => void>();
    originalFetch = globalThis.fetch;
  });

  afterEach(async () => {
    globalThis.fetch = originalFetch;
    if (channel) {
      await channel.stop();
    }
  });

  it('has correct name', () => {
    channel = new DiscordChannel({ ...baseDeps, audit, pipeline, onInbound });
    expect(channel.name).toBe('discord');
  });

  it('starts and logs audit event', async () => {
    const responses = new Map<string, unknown>();
    responses.set('/channels/ch-1/messages?limit=1', [{ id: '100' }]);
    globalThis.fetch = createMockFetch(responses) as typeof fetch;

    channel = new DiscordChannel({ ...baseDeps, audit, pipeline, onInbound });
    await channel.start();

    expect(audit.logAction).toHaveBeenCalledWith('discord:start', expect.any(Object));
  });

  it('stops and clears timer', async () => {
    const responses = new Map<string, unknown>();
    responses.set('/channels/ch-1/messages?limit=1', [{ id: '100' }]);
    globalThis.fetch = createMockFetch(responses) as typeof fetch;

    channel = new DiscordChannel({ ...baseDeps, audit, pipeline, onInbound });
    await channel.start();
    await channel.stop();

    expect(audit.logAction).toHaveBeenCalledWith('discord:stop', {});
  });

  it('polls and processes new messages', async () => {
    const responses = new Map<string, unknown>();
    responses.set('/channels/ch-1/messages?limit=1', [{ id: '100' }]);
    responses.set('/channels/ch-1/messages?after=100', mockMessages);
    globalThis.fetch = createMockFetch(responses) as typeof fetch;

    channel = new DiscordChannel({ ...baseDeps, audit, pipeline, onInbound });
    await channel.start();
    await channel.pollOnce();

    expect(onInbound).toHaveBeenCalledWith(
      expect.objectContaining({
        platform: 'discord',
        senderId: 'user1',
        content: 'Hello from Discord',
      }),
    );
  });

  it('skips bot messages', async () => {
    const botMessages = [
      {
        id: '201',
        author: { id: 'bot1', username: 'BotUser', bot: true },
        content: 'I am a bot',
        timestamp: '2024-01-01T00:00:00Z',
      },
    ];

    const responses = new Map<string, unknown>();
    responses.set('/channels/ch-1/messages?limit=1', [{ id: '100' }]);
    responses.set('/channels/ch-1/messages?after=100', botMessages);
    globalThis.fetch = createMockFetch(responses) as typeof fetch;

    channel = new DiscordChannel({ ...baseDeps, audit, pipeline, onInbound });
    await channel.start();
    await channel.pollOnce();

    expect(onInbound).not.toHaveBeenCalled();
  });

  it('identifies owner messages', async () => {
    const ownerMessages = [
      {
        id: '202',
        author: { id: 'ceo-user', username: 'Owner', bot: false },
        content: 'owner command',
        timestamp: '2024-01-01T00:00:00Z',
      },
    ];

    const responses = new Map<string, unknown>();
    responses.set('/channels/ch-1/messages?limit=1', [{ id: '100' }]);
    responses.set('/channels/ch-1/messages?after=100', ownerMessages);
    globalThis.fetch = createMockFetch(responses) as typeof fetch;

    channel = new DiscordChannel({ ...baseDeps, audit, pipeline, onInbound });
    await channel.start();
    await channel.pollOnce();

    expect(onInbound).toHaveBeenCalledWith(
      expect.objectContaining({
        senderIsOwner: true,
      }),
    );
  });

  it('sends message to a channel', async () => {
    const responses = new Map<string, unknown>();
    responses.set('/channels/ch-1/messages?limit=1', [{ id: '100' }]);
    responses.set('/channels/ch-1/messages', {});
    globalThis.fetch = createMockFetch(responses) as typeof fetch;

    channel = new DiscordChannel({ ...baseDeps, audit, pipeline, onInbound });
    await channel.start();
    await channel.sendMessage('Hello', 'ch-1');

    expect(audit.logAction).toHaveBeenCalledWith('discord:message_sent', expect.any(Object));
  });

  it('resolves guild text channels when no channel IDs provided', async () => {
    const guildChannels = [
      { id: 'text-1', type: 0, name: 'general' },
      { id: 'voice-1', type: 2, name: 'voice' },
      { id: 'text-2', type: 0, name: 'dev' },
    ];

    const responses = new Map<string, unknown>();
    responses.set('/guilds/guild-123/channels', guildChannels);
    responses.set('/channels/', [{ id: '1' }]);
    globalThis.fetch = createMockFetch(responses) as typeof fetch;

    channel = new DiscordChannel({
      ...baseDeps,
      channelIds: [], // No explicit channels
      audit,
      pipeline,
      onInbound,
    });
    await channel.start();

    // Should have resolved 2 text channels
    expect(audit.logAction).toHaveBeenCalledWith('discord:start', expect.any(Object));
  });

  it('ingests messages into pipeline', async () => {
    const responses = new Map<string, unknown>();
    responses.set('/channels/ch-1/messages?limit=1', [{ id: '100' }]);
    responses.set('/channels/ch-1/messages?after=100', mockMessages);
    globalThis.fetch = createMockFetch(responses) as typeof fetch;

    channel = new DiscordChannel({ ...baseDeps, audit, pipeline, onInbound });
    await channel.start();
    await channel.pollOnce();

    expect(pipeline.ingestEvent).toHaveBeenCalledWith(
      'discord:message',
      expect.objectContaining({
        content: expect.any(String),
        channelId: 'ch-1',
        senderId: 'user1',
      }),
    );
  });

  it('handles poll errors gracefully', async () => {
    const failFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve([{ id: '100' }]),
      })
      .mockRejectedValueOnce(new Error('Network error'));

    globalThis.fetch = failFetch as unknown as typeof fetch;

    channel = new DiscordChannel({ ...baseDeps, audit, pipeline, onInbound });
    await channel.start();
    await channel.pollOnce();

    expect(audit.logAction).toHaveBeenCalledWith(
      'discord:poll_error',
      expect.objectContaining({ channelId: 'ch-1' }),
      { success: false },
    );
  });
});
