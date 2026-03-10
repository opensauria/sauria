import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../channels/telegram.js', () => ({
  TelegramChannel: vi.fn(function () { return { type: 'telegram' }; }),
}));

vi.mock('../channels/slack.js', () => ({
  SlackChannel: vi.fn(function () { return { type: 'slack' }; }),
}));

vi.mock('../channels/discord.js', () => ({
  DiscordChannel: vi.fn(function () { return { type: 'discord' }; }),
}));

vi.mock('../channels/email.js', () => ({
  EmailChannel: vi.fn(function () { return { type: 'email' }; }),
}));

vi.mock('../channels/transcription.js', () => ({
  TranscriptionService: vi.fn(),
}));

vi.mock('../ingestion/pipeline.js', () => ({
  IngestPipeline: vi.fn(),
}));

vi.mock('../security/rate-limiter.js', () => ({
  createLimiter: vi.fn(() => ({})),
  SECURITY_LIMITS: { ingestion: { maxEventsPerHour: 100 } },
}));

vi.mock('../security/vault-key.js', () => ({
  vaultGet: vi.fn(),
}));

vi.mock('../utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import type { AgentNode } from '../orchestrator/types.js';
import { vaultGet } from '../security/vault-key.js';
import { TelegramChannel } from '../channels/telegram.js';
import { SlackChannel } from '../channels/slack.js';
import { DiscordChannel } from '../channels/discord.js';
import { EmailChannel } from '../channels/email.js';
import { createChannelForNode } from '../channel-factory.js';

function makeNode(overrides: Partial<AgentNode> = {}): AgentNode {
  return {
    id: 'node-1',
    platform: 'telegram',
    label: '@test_bot',
    photo: null,
    position: { x: 0, y: 0 },
    status: 'connected',
    credentials: 'vault',
    meta: {},
    workspaceId: null,
    role: 'assistant',
    autonomy: 'supervised',
    instructions: 'Be helpful',
    ...overrides,
  };
}

const baseDeps = {
  db: {} as never,
  router: {} as never,
  audit: { logAction: vi.fn() } as never,
  config: {
    owner: { telegram: { userId: 12345 }, slack: undefined, whatsapp: undefined },
    channels: {
      telegram: {
        allowedUserIds: [],
        voice: { enabled: false, model: 'auto', maxDurationSeconds: 120 },
      },
      discord: { guildId: 'guild-1', botUserId: 'bot-1' },
      whatsapp: { phoneNumberId: 'phone-1', webhookPort: 9090 },
      email: {
        imapHost: 'imap.test.com',
        imapPort: 993,
        smtpHost: 'smtp.test.com',
        smtpPort: 587,
        username: 'user@test.com',
        tls: true,
      },
    },
  } as never,
  onInbound: vi.fn(),
  globalInstructions: 'Global rules',
};

describe('createChannelForNode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null for telegram node without token', async () => {
    vi.mocked(vaultGet).mockResolvedValue(null);

    const result = await createChannelForNode(makeNode(), baseDeps);

    expect(result).toBeNull();
  });

  it('creates TelegramChannel when token exists', async () => {
    vi.mocked(vaultGet).mockResolvedValue('bot-token-123');

    const result = await createChannelForNode(makeNode(), baseDeps);

    expect(result).not.toBeNull();
    expect(TelegramChannel).toHaveBeenCalled();
  });

  it('returns null for slack node without credentials', async () => {
    vi.mocked(vaultGet).mockResolvedValue(null);

    const result = await createChannelForNode(makeNode({ platform: 'slack' }), baseDeps);

    expect(result).toBeNull();
  });

  it('creates SlackChannel when credentials exist', async () => {
    vi.mocked(vaultGet).mockImplementation(async (key) => {
      if (key === 'channel_token_node-1') return 'xoxb-token';
      if (key === 'channel_signing_node-1') return 'signing-secret';
      return null;
    });

    const result = await createChannelForNode(makeNode({ platform: 'slack' }), baseDeps);

    expect(result).not.toBeNull();
    expect(SlackChannel).toHaveBeenCalled();
  });

  it('returns null for discord node without token', async () => {
    vi.mocked(vaultGet).mockResolvedValue(null);

    const result = await createChannelForNode(makeNode({ platform: 'discord' }), baseDeps);

    expect(result).toBeNull();
  });

  it('creates DiscordChannel when token exists', async () => {
    vi.mocked(vaultGet).mockResolvedValue('discord-token');

    const result = await createChannelForNode(makeNode({ platform: 'discord' }), baseDeps);

    expect(result).not.toBeNull();
    expect(DiscordChannel).toHaveBeenCalled();
  });

  it('returns null for email node without credentials', async () => {
    vi.mocked(vaultGet).mockResolvedValue(null);

    const result = await createChannelForNode(makeNode({ platform: 'email' }), baseDeps);

    expect(result).toBeNull();
  });

  it('creates EmailChannel when credentials exist', async () => {
    vi.mocked(vaultGet).mockResolvedValue('email-password');

    const result = await createChannelForNode(makeNode({ platform: 'email' }), baseDeps);

    expect(result).not.toBeNull();
    expect(EmailChannel).toHaveBeenCalled();
  });

  it('returns null for unsupported platform', async () => {
    vi.mocked(vaultGet).mockResolvedValue(null);

    const result = await createChannelForNode(
      makeNode({ platform: 'sms' as AgentNode['platform'] }),
      baseDeps,
    );

    expect(result).toBeNull();
  });

  it('builds persona block with display name and role', async () => {
    vi.mocked(vaultGet).mockResolvedValue('bot-token');

    await createChannelForNode(makeNode(), baseDeps);

    expect(TelegramChannel).toHaveBeenCalled();
    const callArgs = vi.mocked(TelegramChannel).mock.calls[0]?.[0] as Record<string, unknown>;
    const instructions = callArgs['instructions'] as string;
    expect(instructions).toContain('test_bot');
    expect(instructions).toContain('assistant');
    expect(instructions).toContain('Global rules');
  });

  it('uses meta firstName for display name when available', async () => {
    vi.mocked(vaultGet).mockResolvedValue('bot-token');

    await createChannelForNode(
      makeNode({ meta: { firstName: 'Karl' } }),
      baseDeps,
    );

    expect(TelegramChannel).toHaveBeenCalled();
    const callArgs = vi.mocked(TelegramChannel).mock.calls[0]?.[0] as Record<string, unknown>;
    const instructions = callArgs['instructions'] as string;
    expect(instructions).toContain('Karl');
  });

  it('returns null for whatsapp without complete credentials', async () => {
    vi.mocked(vaultGet).mockResolvedValue(null);

    const result = await createChannelForNode(makeNode({ platform: 'whatsapp' }), baseDeps);

    expect(result).toBeNull();
  });

  it('returns null for email when imap host is empty', async () => {
    vi.mocked(vaultGet).mockResolvedValue('password');

    const depsNoEmail = {
      ...baseDeps,
      config: {
        ...baseDeps.config,
        channels: {
          ...baseDeps.config.channels,
          email: { imapHost: '', imapPort: 993, smtpHost: '', smtpPort: 587, username: '', tls: true },
        },
      } as never,
    };

    const result = await createChannelForNode(makeNode({ platform: 'email' }), depsNoEmail);

    expect(result).toBeNull();
  });
});
