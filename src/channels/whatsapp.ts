import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { ProactiveAlert } from '../engine/proactive.js';
import type { AuditLogger } from '../security/audit.js';
import type { IngestPipeline } from '../ingestion/pipeline.js';
import type { InboundMessage } from '../orchestrator/types.js';
import { sanitizeChannelInput } from '../security/sanitize.js';
import { createLimiter, SECURITY_LIMITS } from '../security/rate-limiter.js';
import { formatAlert, type Channel } from './base.js';

const GRAPH_API_BASE = 'https://graph.facebook.com/v18.0/';
const FETCH_TIMEOUT_MS = 10_000;
const MAX_REQUEST_BODY_BYTES = 1_048_576;

export interface WhatsAppDeps {
  readonly accessToken: string;
  readonly phoneNumberId: string;
  readonly webhookPort: number;
  readonly verifyToken: string;
  readonly appSecret: string;
  readonly audit: AuditLogger;
  readonly pipeline: IngestPipeline;
  readonly onInbound?: (message: InboundMessage) => void;
}

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

interface WhatsAppWebhookPayload {
  readonly object: string;
  readonly entry?: readonly {
    readonly id: string;
    readonly changes: readonly WhatsAppChange[];
  }[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isWhatsAppPayload(value: unknown): value is WhatsAppWebhookPayload {
  if (!isRecord(value)) return false;
  return value['object'] === 'whatsapp_business_account' && Array.isArray(value['entry']);
}

export class WhatsAppChannel implements Channel {
  readonly name = 'whatsapp';
  private readonly limiter = createLimiter(
    'whatsapp',
    SECURITY_LIMITS.channels.maxInboundMessagesPerMinute,
    60_000,
  );
  private server: Server | null = null;
  private silenceUntil = 0;

  constructor(private readonly deps: WhatsAppDeps) {}

  async start(): Promise<void> {
    const { audit, webhookPort } = this.deps;
    audit.logAction('whatsapp:start', { port: webhookPort });

    this.server = createServer((req, res) => {
      void this.handleRequest(req, res);
    });

    await new Promise<void>((resolve, reject) => {
      const srv = this.server;
      if (!srv) {
        reject(new Error('Server not initialized'));
        return;
      }
      srv.on('error', reject);
      srv.listen(webhookPort, '127.0.0.1', () => {
        srv.removeListener('error', reject);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    this.deps.audit.logAction('whatsapp:stop', {});
    await new Promise<void>((resolve, reject) => {
      if (!this.server) {
        resolve();
        return;
      }
      this.server.close((err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
      this.server = null;
    });
  }

  async sendAlert(alert: ProactiveAlert): Promise<void> {
    if (Date.now() < this.silenceUntil) return;
    const text = formatAlert(alert);
    await this.sendTextMessage(this.deps.phoneNumberId, text);
  }

  async sendMessage(content: string, groupId: string | null): Promise<void> {
    const recipient = groupId ?? this.deps.phoneNumberId;
    await this.sendTextMessage(recipient, content);
  }

  async sendToGroup(groupId: string, content: string): Promise<void> {
    await this.sendTextMessage(groupId, content);
  }

  private async sendTextMessage(recipientId: string, text: string): Promise<void> {
    const { accessToken, phoneNumberId, audit } = this.deps;
    const url = `${GRAPH_API_BASE}${phoneNumberId}/messages`;

    const body = JSON.stringify({
      messaging_product: 'whatsapp',
      to: recipientId,
      type: 'text',
      text: { body: text },
    });

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body,
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        audit.logAction(
          'whatsapp:send_error',
          { status: response.status, errorBody, recipientId },
          { success: false },
        );
        return;
      }

      audit.logAction('whatsapp:message_sent', { recipientId });
    } catch (error: unknown) {
      audit.logAction(
        'whatsapp:send_error',
        { error: String(error), recipientId },
        { success: false },
      );
    }
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const { audit } = this.deps;

    if (req.method === 'GET') {
      this.handleVerification(req, res);
      return;
    }

    if (req.method !== 'POST') {
      res.writeHead(405).end();
      return;
    }

    try {
      const rawBody = await this.readBody(req);
      if (!this.verifySignature(req, rawBody)) {
        audit.logAction('whatsapp:invalid_signature', {}, { success: false });
        res.writeHead(401).end();
        return;
      }

      const payload: unknown = JSON.parse(rawBody);
      if (!isWhatsAppPayload(payload)) {
        res.writeHead(400).end();
        return;
      }

      this.processWebhookPayload(payload);
      res.writeHead(200).end();
    } catch (error: unknown) {
      audit.logAction('whatsapp:webhook_error', { error: String(error) }, { success: false });
      res.writeHead(400).end();
    }
  }

  private handleVerification(req: IncomingMessage, res: ServerResponse): void {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    if (mode === 'subscribe' && token === this.deps.verifyToken && challenge) {
      this.deps.audit.logAction('whatsapp:webhook_verified', {});
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(challenge);
      return;
    }

    this.deps.audit.logAction('whatsapp:verification_failed', { mode }, { success: false });
    res.writeHead(403).end();
  }

  private verifySignature(req: IncomingMessage, rawBody: string): boolean {
    const signatureHeader = req.headers['x-hub-signature-256'];
    if (typeof signatureHeader !== 'string') return false;

    const expectedSignature = createHmac('sha256', this.deps.appSecret)
      .update(rawBody)
      .digest('hex');

    const expected = `sha256=${expectedSignature}`;

    if (signatureHeader.length !== expected.length) return false;

    return timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected));
  }

  private processWebhookPayload(payload: WhatsAppWebhookPayload): void {
    const { audit, onInbound, phoneNumberId } = this.deps;
    const entries = payload.entry ?? [];

    for (const entry of entries) {
      for (const change of entry.changes) {
        const { value } = change;
        if (value.metadata.phone_number_id !== phoneNumberId) continue;

        const messages = value.messages ?? [];
        for (const msg of messages) {
          if (msg.type !== 'text' || !msg.text?.body) continue;

          if (!this.limiter.tryConsume()) {
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

          void this.ingestText(sanitized, 'whatsapp:text');

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
            from: msg.from,
            messageId: msg.id,
          });
        }
      }
    }
  }

  private async ingestText(text: string, source: string): Promise<void> {
    const { pipeline, audit } = this.deps;
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

  private readBody(req: IncomingMessage): Promise<string> {
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
}
