import { describe, it, expect, vi, beforeEach } from 'vitest';
import { countRows, handleStatus, handleEntity, handleUpcoming, handleInsights } from '../telegram-queries.js';

vi.mock('../../security/sanitize.js', () => ({
  sanitizeChannelInput: vi.fn((text: string) => text),
}));

vi.mock('../../db/temporal.js', () => ({
  getUpcomingDeadlines: vi.fn().mockReturnValue([]),
}));

vi.mock('../../db/world-model.js', () => ({
  getEntityByName: vi.fn().mockReturnValue(null),
  getEntityRelations: vi.fn().mockReturnValue([]),
  getEntityTimeline: vi.fn().mockReturnValue([]),
  searchEntities: vi.fn().mockReturnValue([]),
}));

function mockCtx() {
  return {
    reply: vi.fn().mockResolvedValue(undefined),
  };
}

function mockDb(rows?: unknown[]) {
  return {
    prepare: vi.fn().mockReturnValue({
      get: vi.fn().mockReturnValue(rows?.[0] ?? undefined),
      all: vi.fn().mockReturnValue(rows ?? []),
    }),
  };
}

describe('countRows', () => {
  it('returns count from query result', () => {
    const db = {
      prepare: vi.fn().mockReturnValue({
        get: vi.fn().mockReturnValue({ c: 42 }),
      }),
    };

    expect(countRows(db as never, 'SELECT COUNT(*) AS c FROM entities')).toBe(42);
  });

  it('returns 0 when no row', () => {
    const db = {
      prepare: vi.fn().mockReturnValue({
        get: vi.fn().mockReturnValue(undefined),
      }),
    };

    expect(countRows(db as never, 'SELECT COUNT(*) AS c FROM entities')).toBe(0);
  });
});

describe('handleStatus', () => {
  it('replies with status summary', async () => {
    const ctx = mockCtx();
    const db = mockDb([{ c: 5 }]);
    // Override to return different values for different queries
    db.prepare
      .mockReturnValueOnce({ get: vi.fn().mockReturnValue({ c: 10 }) })
      .mockReturnValueOnce({ get: vi.fn().mockReturnValue({ c: 20 }) })
      .mockReturnValueOnce({ get: vi.fn().mockReturnValue({ ts: '2024-01-01' }) });

    await handleStatus(ctx as never, db as never);

    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Sauria Status'));
  });
});

describe('handleEntity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('replies not found when entity does not exist', async () => {
    const ctx = mockCtx();
    const db = {} as never;

    await handleEntity(ctx as never, 'Nobody', db);

    expect(ctx.reply).toHaveBeenCalledWith('Entity "Nobody" not found.');
  });

  it('replies with entity details when found', async () => {
    const { getEntityByName } = await import('../../db/world-model.js');
    (getEntityByName as ReturnType<typeof vi.fn>).mockReturnValue({
      id: 'e-1',
      name: 'Teo',
      type: 'person',
      summary: 'A person',
    });

    const ctx = mockCtx();
    const db = {} as never;

    await handleEntity(ctx as never, 'Teo', db);

    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Teo (person)'));
  });
});

describe('handleUpcoming', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('replies with no deadlines when empty', async () => {
    const ctx = mockCtx();
    const db = {} as never;

    await handleUpcoming(ctx as never, 24, db);

    expect(ctx.reply).toHaveBeenCalledWith('No upcoming deadlines in the next 24 hours.');
  });

  it('lists deadlines when present', async () => {
    const { getUpcomingDeadlines } = await import('../../db/temporal.js');
    (getUpcomingDeadlines as ReturnType<typeof vi.fn>).mockReturnValue([
      { timestamp: '2024-01-01T10:00:00Z', eventType: 'meeting' },
    ]);

    const ctx = mockCtx();
    const db = {} as never;

    await handleUpcoming(ctx as never, 12, db);

    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('meeting'));
  });
});

describe('handleInsights', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('replies with no insights when empty', async () => {
    const ctx = mockCtx();
    const db = mockDb([]);

    await handleInsights(ctx as never, db as never);

    expect(ctx.reply).toHaveBeenCalledWith('No insights generated yet.');
  });

  it('lists insights when present', async () => {
    const ctx = mockCtx();
    const db = mockDb();
    db.prepare.mockReturnValue({
      all: vi.fn().mockReturnValue([
        { content: 'Insight one', created_at: '2024-01-01' },
      ]),
    });

    await handleInsights(ctx as never, db as never);

    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Insight one'));
  });
});
