import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processInboundMessage } from '../discord-handlers.js';
import type { DiscordMessage } from '../discord-handlers.js';
import type { ChannelGuards } from '../base.js';

vi.mock('../../security/sanitize.js', () => ({
  sanitizeChannelInput: vi.fn((text: string) => text),
}));

function mockAudit() {
  return { logAction: vi.fn() };
}

function mockPipeline() {
  return { ingestEvent: vi.fn().mockResolvedValue(undefined) };
}

function mockGuards(canConsume = true): ChannelGuards {
  return { tryConsume: vi.fn().mockReturnValue(canConsume) } as unknown as ChannelGuards;
}

function makeMessage(overrides: Partial<DiscordMessage> = {}): DiscordMessage {
  return {
    id: 'msg-1',
    author: { id: 'user1', username: 'TestUser', bot: false },
    content: 'Hello Discord',
    timestamp: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('processInboundMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('skips empty messages', async () => {
    const audit = mockAudit();
    const pipeline = mockPipeline();
    const guards = mockGuards();

    await processInboundMessage(
      'ch-1',
      makeMessage({ content: '   ' }),
      { audit, pipeline } as never,
      guards,
    );

    expect(pipeline.ingestEvent).not.toHaveBeenCalled();
  });

  it('rate limits and logs audit', async () => {
    const audit = mockAudit();
    const pipeline = mockPipeline();
    const guards = mockGuards(false);

    await processInboundMessage('ch-1', makeMessage(), { audit, pipeline } as never, guards);

    expect(audit.logAction).toHaveBeenCalledWith('discord:rate_limited', {
      channelId: 'ch-1',
      senderId: 'user1',
    });
  });

  it('processes message and calls onInbound', async () => {
    const audit = mockAudit();
    const pipeline = mockPipeline();
    const onInbound = vi.fn();
    const guards = mockGuards();

    await processInboundMessage(
      'ch-1',
      makeMessage(),
      { audit, pipeline, onInbound, nodeId: 'discord-node', ownerId: 'owner-1' } as never,
      guards,
    );

    expect(onInbound).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceNodeId: 'discord-node',
        platform: 'discord',
        senderId: 'user1',
        senderIsOwner: false,
        groupId: 'ch-1',
        content: 'Hello Discord',
      }),
    );
  });

  it('identifies owner messages', async () => {
    const audit = mockAudit();
    const pipeline = mockPipeline();
    const onInbound = vi.fn();
    const guards = mockGuards();

    await processInboundMessage(
      'ch-1',
      makeMessage({ author: { id: 'owner-1', username: 'Owner', bot: false } }),
      { audit, pipeline, onInbound, nodeId: 'discord-node', ownerId: 'owner-1' } as never,
      guards,
    );

    expect(onInbound).toHaveBeenCalledWith(expect.objectContaining({ senderIsOwner: true }));
  });

  it('uses default nodeId when not provided', async () => {
    const audit = mockAudit();
    const pipeline = mockPipeline();
    const onInbound = vi.fn();
    const guards = mockGuards();

    await processInboundMessage(
      'ch-1',
      makeMessage(),
      { audit, pipeline, onInbound } as never,
      guards,
    );

    expect(onInbound).toHaveBeenCalledWith(
      expect.objectContaining({ sourceNodeId: 'discord-default' }),
    );
  });

  it('does not call onInbound when not provided', async () => {
    const audit = mockAudit();
    const pipeline = mockPipeline();
    const guards = mockGuards();

    await processInboundMessage('ch-1', makeMessage(), { audit, pipeline } as never, guards);

    expect(audit.logAction).toHaveBeenCalledWith('discord:message_received', expect.any(Object));
  });

  it('handles sanitize error gracefully', async () => {
    const { sanitizeChannelInput } = await import('../../security/sanitize.js');
    (sanitizeChannelInput as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      throw new Error('sanitize fail');
    });

    const audit = mockAudit();
    const pipeline = mockPipeline();
    const guards = mockGuards();

    await processInboundMessage('ch-1', makeMessage(), { audit, pipeline } as never, guards);

    expect(audit.logAction).toHaveBeenCalledWith(
      'discord:sanitize_error',
      expect.objectContaining({ error: expect.stringContaining('sanitize fail') }),
      { success: false },
    );
  });

  it('handles pipeline ingest error gracefully', async () => {
    const audit = mockAudit();
    const pipeline = { ingestEvent: vi.fn().mockRejectedValue(new Error('ingest fail')) };
    const guards = mockGuards();

    await processInboundMessage('ch-1', makeMessage(), { audit, pipeline } as never, guards);

    expect(audit.logAction).toHaveBeenCalledWith(
      'discord:ingest_error',
      expect.objectContaining({ error: expect.stringContaining('ingest fail') }),
      { success: false },
    );
  });

  it('logs message received with correct fields', async () => {
    const audit = mockAudit();
    const pipeline = mockPipeline();
    const guards = mockGuards();

    await processInboundMessage(
      'ch-1',
      makeMessage(),
      { audit, pipeline, ownerId: 'other' } as never,
      guards,
    );

    expect(audit.logAction).toHaveBeenCalledWith('discord:message_received', {
      channelId: 'ch-1',
      senderId: 'user1',
      isOwner: false,
      textLength: 13,
    });
  });
});
