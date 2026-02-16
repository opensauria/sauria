import { SECURITY_LIMITS } from '../../security/rate-limiter.js';
import type { McpSourceClient } from './mcp.js';
import type { IngestPipeline } from '../pipeline.js';

interface CalendarEvent {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly start: string;
  readonly end?: string;
  readonly location?: string;
  readonly attendees?: readonly string[];
}

function isCalendarEvent(value: unknown): value is CalendarEvent {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record['id'] === 'string' &&
    typeof record['title'] === 'string' &&
    typeof record['start'] === 'string'
  );
}

function toRawData(event: CalendarEvent): Record<string, unknown> {
  return {
    type: 'calendar_event',
    subject: event.title,
    description: event.description ?? '',
    date: event.start,
    end: event.end ?? '',
    location: event.location ?? '',
    attendees: Array.isArray(event.attendees) ? event.attendees.join(', ') : '',
  };
}

export async function ingestCalendarEvents(
  mcpClient: McpSourceClient,
  pipeline: IngestPipeline,
  limit?: number,
): Promise<number> {
  const effectiveLimit = Math.min(
    limit ?? SECURITY_LIMITS.ingestion.maxEventsPerHour,
    SECURITY_LIMITS.ingestion.maxEventsPerHour,
  );

  const rawEvents = await mcpClient.callTool('list_events', {
    limit: effectiveLimit,
  });

  if (!Array.isArray(rawEvents)) {
    return 0;
  }

  let processedCount = 0;

  for (const raw of rawEvents) {
    if (processedCount >= effectiveLimit) {
      break;
    }

    if (!isCalendarEvent(raw)) {
      continue;
    }

    await pipeline.ingestEvent('calendar', toRawData(raw));
    processedCount++;
  }

  return processedCount;
}
