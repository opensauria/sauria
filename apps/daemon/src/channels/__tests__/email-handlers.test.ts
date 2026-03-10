import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processInboundEmail, extractTextFromSource } from '../email-handlers.js';
import type { ParsedEmail } from '../email-handlers.js';
import type { ChannelGuards } from '../base.js';

vi.mock('../../security/sanitize.js', () => ({
  sanitizeChannelInput: vi.fn((text: string) => text),
  InputTooLongError: class InputTooLongError extends Error {
    constructor() {
      super('Input too long');
      this.name = 'InputTooLongError';
    }
  },
}));

vi.mock('../../security/pii-scrubber.js', () => ({
  scrubPII: vi.fn((text: string) => `[SCRUBBED:${text}]`),
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

function makeEmail(overrides: Partial<ParsedEmail> = {}): ParsedEmail {
  return {
    uid: 1,
    from: 'sender@example.com',
    subject: 'Test Subject',
    text: 'Email body content',
    date: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('processInboundEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('skips empty email text', async () => {
    const audit = mockAudit();
    const pipeline = mockPipeline();
    const guards = mockGuards();

    await processInboundEmail(makeEmail({ text: '   ' }), { audit, pipeline } as never, guards);

    expect(pipeline.ingestEvent).not.toHaveBeenCalled();
  });

  it('rate limits and logs audit', async () => {
    const audit = mockAudit();
    const pipeline = mockPipeline();
    const guards = mockGuards(false);

    await processInboundEmail(makeEmail(), { audit, pipeline } as never, guards);

    expect(audit.logAction).toHaveBeenCalledWith('email:rate_limited', { from: 'sender@example.com' });
    expect(pipeline.ingestEvent).not.toHaveBeenCalled();
  });

  it('processes valid email and calls onInbound', async () => {
    const audit = mockAudit();
    const pipeline = mockPipeline();
    const onInbound = vi.fn();
    const guards = mockGuards();

    await processInboundEmail(
      makeEmail(),
      { audit, pipeline, onInbound, nodeId: 'email-node' } as never,
      guards,
    );

    expect(onInbound).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceNodeId: 'email-node',
        platform: 'email',
        senderId: 'sender@example.com',
        content: expect.stringContaining('Test Subject'),
      }),
    );
  });

  it('uses default nodeId when not provided', async () => {
    const audit = mockAudit();
    const pipeline = mockPipeline();
    const onInbound = vi.fn();
    const guards = mockGuards();

    await processInboundEmail(
      makeEmail(),
      { audit, pipeline, onInbound } as never,
      guards,
    );

    expect(onInbound).toHaveBeenCalledWith(
      expect.objectContaining({ sourceNodeId: 'email-default' }),
    );
  });

  it('does not call onInbound when not provided', async () => {
    const audit = mockAudit();
    const pipeline = mockPipeline();
    const guards = mockGuards();

    await processInboundEmail(makeEmail(), { audit, pipeline } as never, guards);

    expect(audit.logAction).toHaveBeenCalledWith('email:message_received', expect.any(Object));
  });

  it('ingests into pipeline', async () => {
    const audit = mockAudit();
    const pipeline = mockPipeline();
    const guards = mockGuards();

    await processInboundEmail(makeEmail(), { audit, pipeline } as never, guards);

    expect(pipeline.ingestEvent).toHaveBeenCalledWith('email:message', expect.objectContaining({
      content: 'Email body content',
      from: 'sender@example.com',
      subject: 'Test Subject',
    }));
  });

  it('handles pipeline ingest error gracefully', async () => {
    const audit = mockAudit();
    const pipeline = { ingestEvent: vi.fn().mockRejectedValue(new Error('ingest fail')) };
    const guards = mockGuards();

    await processInboundEmail(makeEmail(), { audit, pipeline } as never, guards);

    expect(audit.logAction).toHaveBeenCalledWith(
      'email:ingest_error',
      expect.objectContaining({ error: expect.stringContaining('ingest fail') }),
      { success: false },
    );
  });

  it('handles sanitize error on text', async () => {
    const { sanitizeChannelInput } = await import('../../security/sanitize.js');
    (sanitizeChannelInput as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      throw new Error('sanitize failed');
    });

    const audit = mockAudit();
    const pipeline = mockPipeline();
    const guards = mockGuards();

    await processInboundEmail(makeEmail(), { audit, pipeline } as never, guards);

    expect(audit.logAction).toHaveBeenCalledWith(
      'email:sanitize_error',
      expect.objectContaining({ error: expect.stringContaining('sanitize failed') }),
      { success: false },
    );
  });

  it('handles InputTooLongError on subject by truncating', async () => {
    const { sanitizeChannelInput, InputTooLongError } = await import('../../security/sanitize.js');
    const mockSanitize = sanitizeChannelInput as ReturnType<typeof vi.fn>;
    // First call (text) succeeds, second call (subject) throws InputTooLongError
    mockSanitize
      .mockImplementationOnce((text: string) => text)
      .mockImplementationOnce(() => {
        throw new (InputTooLongError as unknown as new () => Error)();
      });

    const audit = mockAudit();
    const pipeline = mockPipeline();
    const guards = mockGuards();
    const longSubject = 'x'.repeat(300);

    await processInboundEmail(makeEmail({ subject: longSubject }), { audit, pipeline } as never, guards);

    expect(pipeline.ingestEvent).toHaveBeenCalledWith('email:message', expect.objectContaining({
      subject: longSubject.slice(0, 200),
    }));
  });

  it('handles non-InputTooLongError on subject by using empty string', async () => {
    const { sanitizeChannelInput } = await import('../../security/sanitize.js');
    const mockSanitize = sanitizeChannelInput as ReturnType<typeof vi.fn>;
    mockSanitize
      .mockImplementationOnce((text: string) => text)
      .mockImplementationOnce(() => {
        throw new Error('generic error');
      });

    const audit = mockAudit();
    const pipeline = mockPipeline();
    const guards = mockGuards();

    await processInboundEmail(makeEmail(), { audit, pipeline } as never, guards);

    expect(pipeline.ingestEvent).toHaveBeenCalledWith('email:message', expect.objectContaining({
      subject: '',
    }));
  });
});

describe('extractTextFromSource', () => {
  it('returns empty string for undefined source', () => {
    expect(extractTextFromSource(undefined)).toBe('');
  });

  it('returns empty string when no double CRLF found', () => {
    const source = Buffer.from('No headers here');
    expect(extractTextFromSource(source)).toBe('');
  });

  it('extracts body after double CRLF', () => {
    const source = Buffer.from('From: a@b.com\r\nSubject: Hi\r\n\r\nBody content here');
    expect(extractTextFromSource(source)).toBe('Body content here');
  });

  it('limits extraction to 2000 chars', () => {
    const longBody = 'x'.repeat(3000);
    const source = Buffer.from(`Headers\r\n\r\n${longBody}`);
    expect(extractTextFromSource(source)).toHaveLength(2000);
  });
});
