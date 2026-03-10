import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ingestEmails } from '../sources/email.js';

vi.mock('../../security/rate-limiter.js', () => ({
  SECURITY_LIMITS: {
    ai: {},
    ingestion: { maxEventsPerHour: 500, maxEmailsPerSync: 100 },
    channels: {},
    mcp: {},
    database: {},
  },
}));

function createMockMcpClient(
  listResult: unknown[] | unknown = [],
  getResult?: (id: string) => unknown,
) {
  return {
    callTool: vi.fn(async (name: string, args: Record<string, unknown>) => {
      if (name === 'list_messages') return listResult;
      if (name === 'get_message' && getResult) return getResult(args['id'] as string);
      return null;
    }),
  } as unknown as Parameters<typeof ingestEmails>[0];
}

function createMockPipeline() {
  return {
    ingestEvent: vi.fn(async () => undefined),
  } as unknown as Parameters<typeof ingestEmails>[1];
}

function makeEmail(id: string, body = 'Hello') {
  return {
    id,
    sender: 'alice@test.com',
    recipient: 'bob@test.com',
    subject: 'Re: Test',
    body,
    date: '2026-03-10T09:00:00Z',
  };
}

describe('ingestEmails', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 0 when MCP returns non-array', async () => {
    const client = createMockMcpClient('invalid');
    const pipeline = createMockPipeline();

    const count = await ingestEmails(client, pipeline);
    expect(count).toBe(0);
  });

  it('returns 0 when MCP returns empty array', async () => {
    const client = createMockMcpClient([]);
    const pipeline = createMockPipeline();

    const count = await ingestEmails(client, pipeline);
    expect(count).toBe(0);
  });

  it('fetches full message for each list item and ingests', async () => {
    const listItems = [makeEmail('msg-1'), makeEmail('msg-2')];
    const client = createMockMcpClient(listItems, (id) => makeEmail(id, `Full body for ${id}`));
    const pipeline = createMockPipeline();

    const count = await ingestEmails(client, pipeline);

    expect(count).toBe(2);
    expect(
      (pipeline as unknown as { ingestEvent: ReturnType<typeof vi.fn> }).ingestEvent,
    ).toHaveBeenCalledTimes(2);
  });

  it('skips list items that are not valid EmailMessage objects', async () => {
    const listItems = [makeEmail('msg-1'), { id: 'msg-2', sender: 'no-body' }, null, 'string'];
    const client = createMockMcpClient(listItems, (id) => makeEmail(id));
    const pipeline = createMockPipeline();

    const count = await ingestEmails(client, pipeline);
    expect(count).toBe(1);
  });

  it('skips when get_message returns invalid data', async () => {
    const listItems = [makeEmail('msg-1')];
    const client = createMockMcpClient(listItems, () => ({ invalid: true }));
    const pipeline = createMockPipeline();

    const count = await ingestEmails(client, pipeline);
    expect(count).toBe(0);
  });

  it('respects the limit parameter', async () => {
    const listItems = Array.from({ length: 10 }, (_, i) => makeEmail(`msg-${i}`));
    const client = createMockMcpClient(listItems, (id) => makeEmail(id));
    const pipeline = createMockPipeline();

    const count = await ingestEmails(client, pipeline, 3);
    expect(count).toBe(3);
  });

  it('caps limit to SECURITY_LIMITS.ingestion.maxEmailsPerSync', async () => {
    const client = createMockMcpClient([]);
    const pipeline = createMockPipeline();

    await ingestEmails(client, pipeline, 99999);

    expect(
      (client as unknown as { callTool: ReturnType<typeof vi.fn> }).callTool,
    ).toHaveBeenCalledWith('list_messages', { limit: 100 });
  });

  it('converts email message to correct raw data format', async () => {
    const email = makeEmail('msg-1', 'Test body');
    const client = createMockMcpClient([email], () => email);
    const pipeline = createMockPipeline();

    await ingestEmails(client, pipeline);

    const call = (pipeline as unknown as { ingestEvent: ReturnType<typeof vi.fn> }).ingestEvent.mock
      .calls[0];
    expect(call?.[0]).toBe('email');
    expect(call?.[1]).toEqual({
      type: 'email',
      sender: 'alice@test.com',
      recipient: 'bob@test.com',
      subject: 'Re: Test',
      body: 'Test body',
      date: '2026-03-10T09:00:00Z',
    });
  });
});
