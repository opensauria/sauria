import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import type { ProactiveAlert } from '../engine/proactive.js';
import type { AuditLogger } from '../security/audit.js';
import type { IngestPipeline } from '../ingestion/pipeline.js';
import type { InboundMessage } from '../orchestrator/types.js';
import { ChannelGuards, formatAlert, type Channel } from './base.js';
import {
  isWhatsAppPayload,
  handleVerification,
  verifySignature,
  processWebhookPayload,
  readBody,
} from './whatsapp-handlers.js';

const GRAPH_API_BASE = 'https://graph.facebook.com/v18.0/';
const FETCH_TIMEOUT_MS = 10_000;

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

export class WhatsAppChannel implements Channel {
  readonly name = 'whatsapp';
  private readonly guards = new ChannelGuards('whatsapp');
  private server: Server | null = null;

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
    if (this.guards.isSilenced()) return;
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
      handleVerification(req, res, this.deps.verifyToken, audit);
      return;
    }

    if (req.method !== 'POST') {
      res.writeHead(405).end();
      return;
    }

    try {
      const rawBody = await readBody(req);
      if (!verifySignature(req, rawBody, this.deps.appSecret)) {
        audit.logAction('whatsapp:invalid_signature', {}, { success: false });
        res.writeHead(401).end();
        return;
      }

      const payload: unknown = JSON.parse(rawBody);
      if (!isWhatsAppPayload(payload)) {
        res.writeHead(400).end();
        return;
      }

      processWebhookPayload(payload, this.deps, this.guards);
      res.writeHead(200).end();
    } catch (error: unknown) {
      audit.logAction('whatsapp:webhook_error', { error: String(error) }, { success: false });
      res.writeHead(400).end();
    }
  }
}
