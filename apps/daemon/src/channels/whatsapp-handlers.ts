import type { IncomingMessage, ServerResponse } from 'node:http';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { AuditLogger } from '../security/audit.js';
import type { IngestPipeline } from '../ingestion/pipeline.js';
import type { InboundMessage } from '../orchestrator/types.js';
import { sanitizeChannelInput } from '../security/sanitize.js';
import { scrubPII } from '../security/pii-scrubber.js';
import type { ChannelGuards } from './base.js';

const MAX_REQUEST_BODY_BYTES = 1_048_576;

interface WhatsAppTextMessage {
  readonly from: string;
  readonly id: string;
  readonly timestamp: string;
  readonly type: string;
  readonly text?: { readonly body: string };
}

interface WhatsAppChange {
  readonly value: {
    readonly messaging_product: string;
    readonly metadata: { readonly phone_number_id: string };
    readonly messages?: readonly WhatsAppTextMessage[];
  };
}

export interface WhatsAppWebhookPayload {
  readonly object: string;
  readonly entry?: readonly {
    readonly id: string;
    readonly changes: readonly WhatsAppChange[];
  }[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function isWhatsAppPayload(value: unknown): value is WhatsAppWebhookPayload {
  if (!isRecord(value)) return false;
  return value['object'] === 'whatsapp_business_account' && Array.isArray(value['entry']);
}

export function handleVerification(
  req: IncomingMessage,
  res: ServerResponse,
  verifyToken: string,
  audit: AuditLogger,
): void {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === verifyToken && challenge) {
    audit.logAction('whatsapp:webhook_verified', {});
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(challenge);
    return;
  }

  audit.logAction('whatsapp:verification_failed', { mode }, { success: false });
  res.writeHead(403).end();
}

export function verifySignature(
  req: IncomingMessage,
  rawBody: string,
  appSecret: string,
): boolean {
  const signatureHeader = req.headers['x-hub-signature-256'];
  if (typeof signatureHeader !== 'string') return false;

  const expectedSignature = createHmac('sha256', appSecret)
    .update(rawBody)
    .digest('hex');

  const expected = `sha256=${expectedSignature}`;

  if (signatureHeader.length !== expected.length) return false;

  return timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected));
}

export function processWebhookPayload(
  payload: WhatsAppWebhookPayload,
  deps: {
    readonly audit: AuditLogger;
    readonly pipeline: IngestPipeline;
    readonly phoneNumberId: string;
    readonly onInbound?: (message: InboundMessage) => void;
  },
  guards: ChannelGuards,
): void {
  const { audit, onInbound, phoneNumberId, pipeline } = deps;
  const entries = payload.entry ?? [];

  for (const entry of entries) {
    for (const change of entry.changes) {
      const { value } = change;
      if (value.metadata.phone_number_id !== phoneNumberId) continue;

      const messages = value.messages ?? [];
      for (const msg of messages) {
        if (msg.type !== 'text' || !msg.text?.body) continue;

        if (!guards.tryConsume()) {
          audit.logAction('whatsapp:rate_limited', { from: msg.from });
          continue;
        }

        let sanitized: string;
        try {
          sanitized = sanitizeChannelInput(msg.text.body);
        } catch (error: unknown) {
          audit.logAction(
            'whatsapp:sanitize_error',
            { error: String(error), from: msg.from },
            { success: false },
          );
          continue;
        }

        void ingestText(pipeline, audit, sanitized, 'whatsapp:text');

        if (onInbound) {
          const inbound: InboundMessage = {
            sourceNodeId: phoneNumberId,
            platform: 'whatsapp',
            senderId: msg.from,
            senderIsOwner: false,
            groupId: null,
            content: sanitized,
            contentType: 'text',
            timestamp: new Date(Number(msg.timestamp) * 1000).toISOString(),
          };
          onInbound(inbound);
        }

        audit.logAction('whatsapp:message_received', {
          from: scrubPII(msg.from),
          messageId: msg.id,
        });
      }
    }
  }
}

async function ingestText(
  pipeline: IngestPipeline,
  audit: AuditLogger,
  text: string,
  source: string,
): Promise<void> {
  try {
    await pipeline.ingestEvent(source, {
      content: text,
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    audit.logAction(
      'whatsapp:ingest_error',
      { source, error: String(error) },
      { success: false },
    );
  }
}

export function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;

    req.on('data', (chunk: Buffer) => {
      totalBytes += chunk.length;
      if (totalBytes > MAX_REQUEST_BODY_BYTES) {
        req.destroy();
        reject(new Error('Request body too large'));
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      resolve(Buffer.concat(chunks).toString('utf-8'));
    });

    req.on('error', reject);
  });
}
