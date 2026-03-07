import type { ProactiveAlert } from '../engine/proactive.js';
import type { AuditLogger } from '../security/audit.js';
import type { IngestPipeline } from '../ingestion/pipeline.js';
import type { InboundMessage } from '../orchestrator/types.js';
import { sanitizeChannelInput, InputTooLongError } from '../security/sanitize.js';
import { scrubPII } from '../security/pii-scrubber.js';
import { ChannelGuards, PollController, formatAlert, type Channel } from './base.js';

const POLL_INTERVAL_MS = 30_000;
const SMTP_TIMEOUT_MS = 15_000;

export interface EmailDeps {
  readonly imapHost: string;
  readonly imapPort: number;
  readonly smtpHost: string;
  readonly smtpPort: number;
  readonly username: string;
  readonly password: string;
  readonly tls: boolean;
  readonly nodeId?: string;
  readonly audit: AuditLogger;
  readonly pipeline: IngestPipeline;
  readonly onInbound?: (message: InboundMessage) => void;
}

interface ParsedEmail {
  readonly uid: number;
  readonly from: string;
  readonly subject: string;
  readonly text: string;
  readonly date: string;
}

export class EmailChannel implements Channel {
  readonly name = 'email';
  private readonly guards = new ChannelGuards('email');
  private readonly poller = new PollController(POLL_INTERVAL_MS);
  private lastSeenUid = 0;
  private imapClient: ImapFlowClient | null = null;
  private smtpTransport: NodemailerTransport | null = null;

  constructor(private readonly deps: EmailDeps) {}

  async start(): Promise<void> {
    const { audit, imapHost, imapPort, smtpHost, smtpPort, username, password, tls } = this.deps;
    audit.logAction('email:start', { imapHost, username });

    try {
      const { ImapFlow } = await import('imapflow');
      this.imapClient = new ImapFlow({
        host: imapHost,
        port: imapPort,
        secure: tls,
        auth: { user: username, pass: password },
        logger: false,
      }) as ImapFlowClient;

      await this.imapClient.connect();
      await this.imapClient.mailboxOpen('INBOX');

      // Get latest UID to only process new messages
      const status = await this.imapClient.status('INBOX', { uidNext: true });
      this.lastSeenUid = (status.uidNext ?? 1) - 1;
    } catch (error) {
      audit.logAction('email:imap_connect_error', { error: String(error) }, { success: false });
    }

    try {
      const nodemailer = await import('nodemailer');
      this.smtpTransport = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: { user: username, pass: password },
        connectionTimeout: SMTP_TIMEOUT_MS,
      }) as NodemailerTransport;
    } catch (error) {
      audit.logAction('email:smtp_connect_error', { error: String(error) }, { success: false });
    }

    this.poller.start(() => this.pollInbox());
  }

  async stop(): Promise<void> {
    this.deps.audit.logAction('email:stop', {});
    this.poller.stop();

    if (this.imapClient) {
      try {
        await this.imapClient.logout();
      } catch {
        // Best-effort cleanup
      }
      this.imapClient = null;
    }

    if (this.smtpTransport) {
      this.smtpTransport.close();
      this.smtpTransport = null;
    }
  }

  async sendAlert(alert: ProactiveAlert): Promise<void> {
    if (this.guards.isSilenced()) return;
    const text = formatAlert(alert);
    await this.sendEmail(this.deps.username, `[Sauria Alert] ${alert.title}`, text);
  }

  async sendMessage(content: string, groupId: string | null): Promise<void> {
    const recipient = groupId ?? this.deps.username;
    await this.sendEmail(recipient, '[Sauria]', content);
  }

  async sendToGroup(groupId: string, content: string): Promise<void> {
    await this.sendEmail(groupId, '[Sauria]', content);
  }

  /** Exposed for testing — triggers one poll cycle. */
  async pollOnce(): Promise<void> {
    await this.pollInbox();
  }

  private async pollInbox(): Promise<void> {
    const { audit } = this.deps;
    if (!this.imapClient) return;

    try {
      const lock = await this.imapClient.getMailboxLock('INBOX');
      try {
        const range = `${String(this.lastSeenUid + 1)}:*`;
        const messages: ParsedEmail[] = [];

        for await (const msg of this.imapClient.fetch(range, {
          uid: true,
          envelope: true,
          source: true,
        })) {
          if (msg.uid <= this.lastSeenUid) continue;

          const from = msg.envelope?.from?.[0]?.address ?? 'unknown';
          const subject = msg.envelope?.subject ?? '';
          const date = msg.envelope?.date?.toISOString() ?? new Date().toISOString();

          // Extract text from raw source
          let text = '';
          if (msg.source) {
            const raw = msg.source.toString();
            // Simple text extraction — get content after headers
            const bodyStart = raw.indexOf('\r\n\r\n');
            if (bodyStart !== -1) {
              text = raw.slice(bodyStart + 4, bodyStart + 4 + 2000);
            }
          }

          messages.push({ uid: msg.uid, from, subject, text: text || subject, date });
        }

        for (const email of messages) {
          await this.processInboundEmail(email);
          if (email.uid > this.lastSeenUid) {
            this.lastSeenUid = email.uid;
          }
        }
      } finally {
        lock.release();
      }
    } catch (error) {
      audit.logAction('email:poll_error', { error: String(error) }, { success: false });
    }
  }

  private async processInboundEmail(email: ParsedEmail): Promise<void> {
    const { audit, pipeline, onInbound, nodeId } = this.deps;

    if (!email.text.trim()) return;

    if (!this.guards.tryConsume()) {
      audit.logAction('email:rate_limited', { from: email.from });
      return;
    }

    let sanitizedText: string;
    try {
      sanitizedText = sanitizeChannelInput(email.text);
    } catch (error) {
      audit.logAction(
        'email:sanitize_error',
        { from: email.from, error: String(error) },
        { success: false },
      );
      return;
    }

    let sanitizedSubject: string;
    try {
      sanitizedSubject = sanitizeChannelInput(email.subject);
    } catch (error: unknown) {
      sanitizedSubject = error instanceof InputTooLongError ? email.subject.slice(0, 200) : '';
    }

    try {
      await pipeline.ingestEvent('email:message', {
        content: sanitizedText,
        timestamp: email.date,
        from: email.from,
        subject: sanitizedSubject,
      });
    } catch (error) {
      audit.logAction('email:ingest_error', { error: String(error) }, { success: false });
    }

    audit.logAction('email:message_received', {
      from: scrubPII(email.from),
      subject: scrubPII(sanitizedSubject),
      textLength: sanitizedText.length,
    });

    if (onInbound) {
      const inbound: InboundMessage = {
        sourceNodeId: nodeId ?? 'email-default',
        platform: 'email',
        senderId: email.from,
        senderIsOwner: false,
        groupId: null,
        content: `[${sanitizedSubject}] ${sanitizedText}`,
        contentType: 'text',
        timestamp: email.date,
      };
      onInbound(inbound);
    }
  }

  private async sendEmail(to: string, subject: string, text: string): Promise<void> {
    const { audit, username } = this.deps;

    if (!this.smtpTransport) {
      audit.logAction('email:send_error', { error: 'SMTP not configured' }, { success: false });
      return;
    }

    try {
      await this.smtpTransport.sendMail({
        from: username,
        to,
        subject,
        text,
      });

      audit.logAction('email:message_sent', { to, subject });
    } catch (error) {
      audit.logAction('email:send_error', { to, error: String(error) }, { success: false });
    }
  }
}

// ─── External library types (minimal) ──────────────────────────────

interface ImapFlowClient {
  connect(): Promise<void>;
  logout(): Promise<void>;
  mailboxOpen(path: string): Promise<unknown>;
  status(path: string, query: { uidNext: boolean }): Promise<{ uidNext?: number }>;
  getMailboxLock(path: string): Promise<{ release(): void }>;
  fetch(
    range: string,
    options: { uid?: boolean; envelope?: boolean; source?: boolean },
  ): AsyncIterable<{
    uid: number;
    envelope?: {
      from?: Array<{ address?: string }>;
      subject?: string;
      date?: Date;
    };
    source?: Buffer;
  }>;
}

interface NodemailerTransport {
  sendMail(options: { from: string; to: string; subject: string; text: string }): Promise<unknown>;
  close(): void;
}
