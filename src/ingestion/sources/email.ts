import { SECURITY_LIMITS } from '../../security/rate-limiter.js';
import type { McpSourceClient } from './mcp.js';
import type { IngestPipeline } from '../pipeline.js';

interface EmailMessage {
  readonly id: string;
  readonly sender: string;
  readonly recipient: string;
  readonly subject: string;
  readonly body: string;
  readonly date: string;
}

function isEmailMessage(value: unknown): value is EmailMessage {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record['id'] === 'string' &&
    typeof record['sender'] === 'string' &&
    typeof record['body'] === 'string'
  );
}

function toRawData(email: EmailMessage): Record<string, unknown> {
  return {
    type: 'email',
    sender: email.sender,
    recipient: email.recipient,
    subject: email.subject,
    body: email.body,
    date: email.date,
  };
}

export async function ingestEmails(
  mcpClient: McpSourceClient,
  pipeline: IngestPipeline,
  limit?: number,
): Promise<number> {
  const effectiveLimit = Math.min(
    limit ?? SECURITY_LIMITS.ingestion.maxEmailsPerSync,
    SECURITY_LIMITS.ingestion.maxEmailsPerSync,
  );

  const rawMessages = await mcpClient.callTool('list_messages', {
    limit: effectiveLimit,
  });

  if (!Array.isArray(rawMessages)) {
    return 0;
  }

  let processedCount = 0;

  for (const raw of rawMessages) {
    if (processedCount >= effectiveLimit) {
      break;
    }

    if (!isEmailMessage(raw)) {
      continue;
    }

    const fullMessage = await mcpClient.callTool('get_message', {
      id: raw.id,
    });

    if (!isEmailMessage(fullMessage)) {
      continue;
    }

    await pipeline.ingestEvent('email', toRawData(fullMessage));
    processedCount++;
  }

  return processedCount;
}
