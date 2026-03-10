import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../db/world-model.js', () => ({
  getEntityByName: vi.fn(),
  getEntityRelations: vi.fn(),
  getEntityTimeline: vi.fn(),
  searchEntities: vi.fn(),
}));
vi.mock('../../db/temporal.js', () => ({
  getUpcomingDeadlines: vi.fn(),
}));
vi.mock('../../db/search.js', () => ({
  hybridSearch: vi.fn(),
}));
vi.mock('../../ai/reason.js', () => ({
  reasonAbout: vi.fn(),
}));
vi.mock('../../security/sanitize.js', () => ({
  deepSanitizeStrings: vi.fn((v: unknown) => v),
}));

import {
  createQueryHandler,
  createGetEntityHandler,
  createSearchHandler,
  createUpcomingHandler,
  createInsightsHandler,
  createContextHandler,
} from '../server-tools.js';
import { searchEntities, getEntityByName, getEntityRelations, getEntityTimeline } from '../../db/world-model.js';
import { getUpcomingDeadlines } from '../../db/temporal.js';
import { hybridSearch } from '../../db/search.js';
import { reasonAbout } from '../../ai/reason.js';

const mockDb = {
  prepare: vi.fn(() => ({ all: vi.fn(() => []) })),
} as unknown as import('better-sqlite3').Database;

const mockRouter = {} as unknown as import('../../ai/router.js').ModelRouter;

const mockAudit = {
  logAction: vi.fn(),
  hashContent: vi.fn(() => 'hash'),
} as unknown as import('../../security/audit.js').AuditLogger;

const guardRateLimit = vi.fn();
const auditToolCall = vi.fn();

const deps = {
  db: mockDb,
  router: mockRouter,
  audit: mockAudit,
  guardRateLimit,
  auditToolCall,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createQueryHandler', () => {
  it('calls guardRateLimit and auditToolCall', async () => {
    vi.mocked(searchEntities).mockReturnValue([]);
    vi.mocked(reasonAbout).mockResolvedValue('answer');
    const handler = createQueryHandler(deps);
    await handler({ query: 'what is AI?' });
    expect(guardRateLimit).toHaveBeenCalledWith('sauria_query');
    expect(auditToolCall).toHaveBeenCalledWith('sauria_query', { query: 'what is AI?' });
  });

  it('returns reasoned answer', async () => {
    vi.mocked(searchEntities).mockReturnValue([]);
    vi.mocked(reasonAbout).mockResolvedValue('AI is artificial intelligence');
    const handler = createQueryHandler(deps);
    const result = await handler({ query: 'what is AI?' });
    expect(result.content[0]?.text).toBe('AI is artificial intelligence');
  });
});

describe('createGetEntityHandler', () => {
  it('returns not found when entity does not exist', async () => {
    vi.mocked(getEntityByName).mockReturnValue(undefined);
    const handler = createGetEntityHandler(deps);
    const result = await handler({ name: 'Unknown' });
    expect(result.content[0]?.text).toContain('not found');
  });

  it('returns entity details with relations and timeline', async () => {
    const entity = {
      id: 'e1',
      type: 'person' as const,
      name: 'Alice',
      summary: 'Engineer',
      properties: null,
      importanceScore: 5,
      firstSeenAt: '2026-01-01',
      lastUpdatedAt: '2026-01-02',
      lastMentionedAt: null,
      mentionCount: 3,
    };
    vi.mocked(getEntityByName).mockReturnValue(entity);
    vi.mocked(getEntityRelations).mockReturnValue([
      {
        id: 'r1',
        fromEntityId: 'e1',
        toEntityId: 'e2',
        type: 'works_with',
        strength: 0.8,
        context: null,
        firstSeenAt: '2026-01-01',
        lastUpdatedAt: '2026-01-01',
      },
    ]);
    vi.mocked(getEntityTimeline).mockReturnValue([
      {
        id: 'ev1',
        source: 'email',
        eventType: 'meeting',
        contentHash: null,
        parsedData: null,
        entityIds: null,
        timestamp: '2026-01-01',
        processedAt: null,
        importance: 5,
      },
    ]);
    const handler = createGetEntityHandler(deps);
    const result = await handler({ name: 'Alice' });
    const text = result.content[0]?.text ?? '';
    expect(text).toContain('Alice');
    expect(text).toContain('Relations:');
    expect(text).toContain('works_with');
    expect(text).toContain('Timeline:');
    expect(text).toContain('meeting');
  });

  it('omits relations and timeline sections when empty', async () => {
    const entity = {
      id: 'e1',
      type: 'person' as const,
      name: 'Bob',
      summary: null,
      properties: null,
      importanceScore: 1,
      firstSeenAt: '2026-01-01',
      lastUpdatedAt: '2026-01-01',
      lastMentionedAt: null,
      mentionCount: 0,
    };
    vi.mocked(getEntityByName).mockReturnValue(entity);
    vi.mocked(getEntityRelations).mockReturnValue([]);
    vi.mocked(getEntityTimeline).mockReturnValue([]);
    const handler = createGetEntityHandler(deps);
    const result = await handler({ name: 'Bob' });
    const text = result.content[0]?.text ?? '';
    expect(text).not.toContain('Relations:');
    expect(text).not.toContain('Timeline:');
  });

  it('shows <- arrow for incoming relations', async () => {
    const entity = {
      id: 'e2',
      type: 'person' as const,
      name: 'Bob',
      summary: null,
      properties: null,
      importanceScore: 1,
      firstSeenAt: '2026-01-01',
      lastUpdatedAt: '2026-01-01',
      lastMentionedAt: null,
      mentionCount: 0,
    };
    vi.mocked(getEntityByName).mockReturnValue(entity);
    vi.mocked(getEntityRelations).mockReturnValue([
      {
        id: 'r1',
        fromEntityId: 'e1',
        toEntityId: 'e2',
        type: 'manages',
        strength: 0.9,
        context: null,
        firstSeenAt: '2026-01-01',
        lastUpdatedAt: '2026-01-01',
      },
    ]);
    vi.mocked(getEntityTimeline).mockReturnValue([]);
    const handler = createGetEntityHandler(deps);
    const result = await handler({ name: 'Bob' });
    expect(result.content[0]?.text).toContain('<-');
  });
});

describe('createSearchHandler', () => {
  it('returns no results message when empty', async () => {
    vi.mocked(hybridSearch).mockReturnValue([]);
    const handler = createSearchHandler(deps);
    const result = await handler({ query: 'nothing', limit: 10 });
    expect(result.content[0]?.text).toBe('No results found.');
  });

  it('returns formatted results', async () => {
    vi.mocked(hybridSearch).mockReturnValue([
      {
        id: 'e1',
        type: 'person' as const,
        name: 'Alice',
        summary: null,
        properties: null,
        importanceScore: 5,
        firstSeenAt: '2026-01-01',
        lastUpdatedAt: '2026-01-01',
        lastMentionedAt: null,
        mentionCount: 1,
      },
    ]);
    const handler = createSearchHandler(deps);
    const result = await handler({ query: 'Alice', limit: 10 });
    expect(result.content[0]?.text).toContain('1.');
    expect(result.content[0]?.text).toContain('Alice');
  });
});

describe('createUpcomingHandler', () => {
  it('returns no events message when empty', async () => {
    vi.mocked(getUpcomingDeadlines).mockReturnValue([]);
    const handler = createUpcomingHandler(deps);
    const result = await handler({ hours: 24 });
    expect(result.content[0]?.text).toContain('No upcoming events');
  });

  it('returns formatted events', async () => {
    vi.mocked(getUpcomingDeadlines).mockReturnValue([
      {
        id: 'ev1',
        source: 'calendar',
        eventType: 'deadline',
        contentHash: null,
        parsedData: null,
        entityIds: null,
        timestamp: '2026-03-10T14:00:00Z',
        processedAt: null,
        importance: 8,
      },
    ]);
    const handler = createUpcomingHandler(deps);
    const result = await handler({ hours: 48 });
    const text = result.content[0]?.text ?? '';
    expect(text).toContain('deadline');
    expect(text).toContain('calendar');
    expect(text).toContain('importance: 8');
  });
});

describe('createInsightsHandler', () => {
  it('returns no insights message when empty', async () => {
    const handler = createInsightsHandler(deps);
    const result = await handler({ limit: 5 });
    expect(result.content[0]?.text).toBe('No insights generated yet.');
  });

  it('filters by entity name when provided', async () => {
    const entity = {
      id: 'e1',
      type: 'person' as const,
      name: 'Alice',
      summary: null,
      properties: null,
      importanceScore: 5,
      firstSeenAt: '2026-01-01',
      lastUpdatedAt: '2026-01-01',
      lastMentionedAt: null,
      mentionCount: 1,
    };
    vi.mocked(getEntityByName).mockReturnValue(entity);

    const mockAll = vi.fn().mockReturnValue([
      { content: 'an insight', created_at: '2026-01-01', confidence: 0.9 },
    ]);
    vi.mocked(mockDb.prepare).mockReturnValue({ all: mockAll } as never);

    const handler = createInsightsHandler(deps);
    const result = await handler({ entityName: 'Alice', limit: 5 });
    expect(result.content[0]?.text).toContain('an insight');
    expect(result.content[0]?.text).toContain('0.9');
  });

  it('falls back to all insights when entity has none', async () => {
    const entity = {
      id: 'e1',
      type: 'person' as const,
      name: 'Alice',
      summary: null,
      properties: null,
      importanceScore: 5,
      firstSeenAt: '2026-01-01',
      lastUpdatedAt: '2026-01-01',
      lastMentionedAt: null,
      mentionCount: 1,
    };
    vi.mocked(getEntityByName).mockReturnValue(entity);

    const mockAll = vi
      .fn()
      .mockReturnValueOnce([])
      .mockReturnValueOnce([{ content: 'global insight', created_at: '2026-01-01', confidence: 0.5 }]);
    vi.mocked(mockDb.prepare).mockReturnValue({ all: mockAll } as never);

    const handler = createInsightsHandler(deps);
    const result = await handler({ entityName: 'Alice', limit: 5 });
    expect(result.content[0]?.text).toContain('global insight');
  });

  it('returns not found when entity name provided but not found', async () => {
    vi.mocked(getEntityByName).mockReturnValue(undefined);
    const handler = createInsightsHandler(deps);
    const result = await handler({ entityName: 'Unknown', limit: 5 });
    expect(result.content[0]?.text).toContain('not found');
  });
});

describe('createContextHandler', () => {
  it('returns no matching entities when search is empty', async () => {
    vi.mocked(hybridSearch).mockReturnValue([]);
    const handler = createContextHandler(deps);
    const result = await handler({ topic: 'nothing' });
    expect(result.content[0]?.text).toContain('No matching entities');
  });

  it('includes relations and timeline for found entities', async () => {
    const entity = {
      id: 'e1',
      type: 'person' as const,
      name: 'Alice',
      summary: null,
      properties: null,
      importanceScore: 5,
      firstSeenAt: '2026-01-01',
      lastUpdatedAt: '2026-01-01',
      lastMentionedAt: null,
      mentionCount: 1,
    };
    vi.mocked(hybridSearch).mockReturnValue([entity]);
    vi.mocked(getEntityRelations).mockReturnValue([
      {
        id: 'r1',
        fromEntityId: 'e1',
        toEntityId: 'e2',
        type: 'knows',
        strength: 0.7,
        context: null,
        firstSeenAt: '2026-01-01',
        lastUpdatedAt: '2026-01-01',
      },
    ]);
    vi.mocked(getEntityTimeline).mockReturnValue([
      {
        id: 'ev1',
        source: 'email',
        eventType: 'message',
        contentHash: null,
        parsedData: null,
        entityIds: null,
        timestamp: '2026-01-01',
        processedAt: null,
        importance: 5,
      },
    ]);
    const handler = createContextHandler(deps);
    const result = await handler({ topic: 'Alice' });
    const text = result.content[0]?.text ?? '';
    expect(text).toContain('Context for: Alice');
    expect(text).toContain('Relations:');
    expect(text).toContain('knows');
    expect(text).toContain('Recent events:');
    expect(text).toContain('message');
  });
});
