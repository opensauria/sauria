import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ingestCalendarEvents } from '../sources/calendar.js';

vi.mock('../../security/rate-limiter.js', () => ({
  SECURITY_LIMITS: {
    ai: {},
    ingestion: { maxEventsPerHour: 500, maxEmailsPerSync: 100 },
    channels: {},
    mcp: {},
    database: {},
  },
}));

function createMockMcpClient(events: unknown[] | unknown = []) {
  return {
    callTool: vi.fn(async () => events),
  } as unknown as Parameters<typeof ingestCalendarEvents>[0];
}

function createMockPipeline() {
  return {
    ingestEvent: vi.fn(async () => undefined),
  } as unknown as Parameters<typeof ingestCalendarEvents>[1];
}

describe('ingestCalendarEvents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 0 when MCP returns non-array', async () => {
    const client = createMockMcpClient('not an array');
    const pipeline = createMockPipeline();

    const count = await ingestCalendarEvents(client, pipeline);
    expect(count).toBe(0);
  });

  it('returns 0 when MCP returns empty array', async () => {
    const client = createMockMcpClient([]);
    const pipeline = createMockPipeline();

    const count = await ingestCalendarEvents(client, pipeline);
    expect(count).toBe(0);
  });

  it('processes valid calendar events', async () => {
    const events = [
      { id: 'cal-1', title: 'Standup', start: '2026-03-10T09:00:00Z' },
      { id: 'cal-2', title: 'Lunch', start: '2026-03-10T12:00:00Z', location: 'Cafe' },
    ];
    const client = createMockMcpClient(events);
    const pipeline = createMockPipeline();

    const count = await ingestCalendarEvents(client, pipeline);

    expect(count).toBe(2);
    expect(
      (pipeline as unknown as { ingestEvent: ReturnType<typeof vi.fn> }).ingestEvent,
    ).toHaveBeenCalledTimes(2);
  });

  it('skips items that are not valid CalendarEvent objects', async () => {
    const events = [
      { id: 'cal-1', title: 'Valid', start: '2026-03-10T09:00:00Z' },
      { id: 'cal-2', title: 'Missing start' },
      'not an object',
      null,
    ];
    const client = createMockMcpClient(events);
    const pipeline = createMockPipeline();

    const count = await ingestCalendarEvents(client, pipeline);
    expect(count).toBe(1);
  });

  it('respects the limit parameter', async () => {
    const events = Array.from({ length: 10 }, (_, i) => ({
      id: `cal-${i}`,
      title: `Event ${i}`,
      start: '2026-03-10T09:00:00Z',
    }));
    const client = createMockMcpClient(events);
    const pipeline = createMockPipeline();

    const count = await ingestCalendarEvents(client, pipeline, 3);
    expect(count).toBe(3);
  });

  it('caps limit to SECURITY_LIMITS.ingestion.maxEventsPerHour', async () => {
    const client = createMockMcpClient([]);
    const pipeline = createMockPipeline();

    await ingestCalendarEvents(client, pipeline, 99999);

    expect(
      (client as unknown as { callTool: ReturnType<typeof vi.fn> }).callTool,
    ).toHaveBeenCalledWith('list_events', { limit: 500 });
  });

  it('converts calendar event fields to raw data', async () => {
    const events = [
      {
        id: 'cal-1',
        title: 'Meeting',
        start: '2026-03-10T09:00:00Z',
        end: '2026-03-10T10:00:00Z',
        description: 'Sprint review',
        location: 'Room A',
        attendees: ['alice', 'bob'],
      },
    ];
    const client = createMockMcpClient(events);
    const pipeline = createMockPipeline();

    await ingestCalendarEvents(client, pipeline);

    const call = (pipeline as unknown as { ingestEvent: ReturnType<typeof vi.fn> }).ingestEvent.mock.calls[0];
    expect(call?.[0]).toBe('calendar');
    expect(call?.[1]).toEqual(
      expect.objectContaining({
        type: 'calendar_event',
        subject: 'Meeting',
        description: 'Sprint review',
        date: '2026-03-10T09:00:00Z',
        end: '2026-03-10T10:00:00Z',
        location: 'Room A',
        attendees: 'alice, bob',
      }),
    );
  });

  it('handles missing optional fields gracefully', async () => {
    const events = [{ id: 'cal-1', title: 'Simple', start: '2026-03-10T09:00:00Z' }];
    const client = createMockMcpClient(events);
    const pipeline = createMockPipeline();

    await ingestCalendarEvents(client, pipeline);

    const rawData = (pipeline as unknown as { ingestEvent: ReturnType<typeof vi.fn> }).ingestEvent.mock
      .calls[0]?.[1];
    expect(rawData.description).toBe('');
    expect(rawData.end).toBe('');
    expect(rawData.location).toBe('');
    expect(rawData.attendees).toBe('');
  });
});
