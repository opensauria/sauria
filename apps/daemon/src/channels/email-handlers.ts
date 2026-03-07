import type { AuditLogger } from '../security/audit.js';
import type { IngestPipeline } from '../ingestion/pipeline.js';
import type { InboundMessage } from '../orchestrator/types.js';
import { sanitizeChannelInput, InputTooLongError } from '../security/sanitize.js';
import { scrubPII } from '../security/pii-scrubber.js';
import type { ChannelGuards } from './base.js';

export interface ParsedEmail {
  readonly uid: number;
  readonly from: string;
  readonly subject: string;
  readonly text: string;
  readonly date: string;
}

export interface ImapFlowClient {
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

export interface NodemailerTransport {
  sendMail(options: { from: string; to: string; subject: string; text: string }): Promise<unknown>;
  close(): void;
}

export async function processInboundEmail(
  email: ParsedEmail,
  deps: {
    readonly audit: AuditLogger;
    readonly pipeline: IngestPipeline;
    readonly onInbound?: (message: InboundMessage) => void;
    readonly nodeId?: string;
  },
  guards: ChannelGuards,
): Promise<void> {
  const { audit, pipeline, onInbound, nodeId } = deps;

  if (!email.text.trim()) return;

  if (!guards.tryConsume()) {
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

export function extractTextFromSource(source: Buffer | undefined): string {
  if (!source) return '';
  const raw = source.toString();
  const bodyStart = raw.indexOf('\r\n\r\n');
  if (bodyStart === -1) return '';
  return raw.slice(bodyStart + 4, bodyStart + 4 + 2000);
}
