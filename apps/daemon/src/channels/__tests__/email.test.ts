import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EmailChannel } from '../email.js';
import type { EmailDeps } from '../email.js';
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

// Mock imapflow and nodemailer modules
vi.mock('imapflow', () => ({
  ImapFlow: vi.fn().mockImplementation(function () {
    return {
      connect: vi.fn().mockResolvedValue(undefined),
      logout: vi.fn().mockResolvedValue(undefined),
      mailboxOpen: vi.fn().mockResolvedValue({}),
      status: vi.fn().mockResolvedValue({ uidNext: 10 }),
      getMailboxLock: vi.fn().mockResolvedValue({
        release: vi.fn(),
      }),
      fetch: vi.fn().mockImplementation(function* () {
        yield {
          uid: 11,
          envelope: {
            from: [{ address: 'sender@example.com' }],
            subject: 'Test Subject',
            date: new Date('2024-01-01T00:00:00Z'),
          },
          source: Buffer.from('From: sender@example.com\r\nSubject: Test\r\n\r\nHello from email'),
        };
      }),
    };
  }),
}));

const mockSendMail = vi.fn().mockResolvedValue({ messageId: 'msg-1' });
const mockClose = vi.fn();

vi.mock('nodemailer', () => ({
  createTransport: vi.fn().mockReturnValue({
    sendMail: mockSendMail,
    close: mockClose,
  }),
}));

describe('EmailChannel', () => {
  let channel: EmailChannel;
  let audit: AuditLogger;
  let pipeline: IngestPipeline;
  let onInbound: (message: InboundMessage) => void;

  const baseDeps: Omit<EmailDeps, 'audit' | 'pipeline' | 'onInbound'> = {
    imapHost: 'imap.example.com',
    imapPort: 993,
    smtpHost: 'smtp.example.com',
    smtpPort: 587,
    username: 'user@example.com',
    password: 'secret',
    tls: true,
    nodeId: 'node-email',
  };

  beforeEach(() => {
    audit = mockAudit();
    pipeline = mockPipeline();
    onInbound = vi.fn<(message: InboundMessage) => void>();
    mockSendMail.mockClear();
    mockClose.mockClear();
  });

  it('has correct name', () => {
    channel = new EmailChannel({ ...baseDeps, audit, pipeline, onInbound });
    expect(channel.name).toBe('email');
  });

  it('starts and connects IMAP + SMTP', async () => {
    channel = new EmailChannel({ ...baseDeps, audit, pipeline, onInbound });
    await channel.start();

    expect(audit.logAction).toHaveBeenCalledWith('email:start', expect.any(Object));
    await channel.stop();
  });

  it('stops and cleans up', async () => {
    channel = new EmailChannel({ ...baseDeps, audit, pipeline, onInbound });
    await channel.start();
    await channel.stop();

    expect(audit.logAction).toHaveBeenCalledWith('email:stop', {});
  });

  it('polls inbox and processes new emails', async () => {
    channel = new EmailChannel({ ...baseDeps, audit, pipeline, onInbound });
    await channel.start();
    await channel.pollOnce();

    expect(onInbound).toHaveBeenCalledWith(
      expect.objectContaining({
        platform: 'email',
        senderId: 'sender@example.com',
        content: expect.stringContaining('Test Subject'),
      }),
    );

    await channel.stop();
  });

  it('ingests email events into pipeline', async () => {
    channel = new EmailChannel({ ...baseDeps, audit, pipeline, onInbound });
    await channel.start();
    await channel.pollOnce();

    expect(pipeline.ingestEvent).toHaveBeenCalledWith(
      'email:message',
      expect.objectContaining({
        from: 'sender@example.com',
        subject: 'Test Subject',
      }),
    );

    await channel.stop();
  });

  it('sends email via SMTP', async () => {
    channel = new EmailChannel({ ...baseDeps, audit, pipeline, onInbound });
    await channel.start();

    await channel.sendMessage('Hello', 'recipient@example.com');

    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'user@example.com',
        to: 'recipient@example.com',
        text: 'Hello',
      }),
    );

    await channel.stop();
  });

  it('sends to own address when no group specified', async () => {
    channel = new EmailChannel({ ...baseDeps, audit, pipeline, onInbound });
    await channel.start();

    await channel.sendMessage('Self note', null);

    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
      }),
    );

    await channel.stop();
  });

  it('logs audit for sent messages', async () => {
    channel = new EmailChannel({ ...baseDeps, audit, pipeline, onInbound });
    await channel.start();

    await channel.sendMessage('Test', 'to@example.com');

    expect(audit.logAction).toHaveBeenCalledWith(
      'email:message_sent',
      expect.objectContaining({ to: 'to@example.com' }),
    );

    await channel.stop();
  });

  it('logs audit for received messages', async () => {
    channel = new EmailChannel({ ...baseDeps, audit, pipeline, onInbound });
    await channel.start();
    await channel.pollOnce();

    expect(audit.logAction).toHaveBeenCalledWith(
      'email:message_received',
      expect.objectContaining({
        from: '[EMAIL_REDACTED]',
        subject: 'Test Subject',
      }),
    );

    await channel.stop();
  });

  it('handles SMTP not configured gracefully', async () => {
    // Create channel but simulate SMTP failure by using the channel without start
    channel = new EmailChannel({ ...baseDeps, audit, pipeline, onInbound });
    // Don't call start — SMTP transport won't be set up
    await channel.sendMessage('Test', 'to@example.com');

    expect(audit.logAction).toHaveBeenCalledWith(
      'email:send_error',
      expect.objectContaining({ error: 'SMTP not configured' }),
      { success: false },
    );
  });

  it('sends alert with formatted subject', async () => {
    channel = new EmailChannel({ ...baseDeps, audit, pipeline, onInbound });
    await channel.start();

    await channel.sendAlert({
      type: 'deadline',
      title: 'Deadline approaching',
      details: 'Project X due tomorrow',
      priority: 4,
      entityIds: [],
      timestamp: new Date().toISOString(),
    });

    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: expect.stringContaining('[Sauria Alert]'),
      }),
    );

    await channel.stop();
  });
});
