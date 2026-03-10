import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../security/sanitize.js', () => ({
  sanitizeChannelInput: vi.fn((input: string) => input),
}));

vi.mock('../ai/reason.js', () => ({
  reasonAbout: vi.fn().mockResolvedValue('AI analysis result'),
}));

vi.mock('../db/search.js', () => ({
  searchByKeyword: vi.fn(() => []),
}));

vi.mock('../db/temporal.js', () => ({
  getUpcomingDeadlines: vi.fn(() => []),
}));

vi.mock('../db/world-model.js', () => ({
  getEntityByName: vi.fn(),
  getEntityRelations: vi.fn(() => []),
  getEntityTimeline: vi.fn(() => []),
  searchEntities: vi.fn(() => []),
}));

import {
  askAction,
  statusAction,
  focusAction,
  entityAction,
  upcomingAction,
  insightsAction,
  teachAction,
  sourcesAction,
  auditAction,
  exportAction,
  purgeAction,
} from '../cli-actions.js';
import type { AppContext } from '../cli-actions.js';
import { searchByKeyword } from '../db/search.js';
import { getUpcomingDeadlines } from '../db/temporal.js';
import { getEntityByName, getEntityRelations, getEntityTimeline, searchEntities } from '../db/world-model.js';
import { reasonAbout } from '../ai/reason.js';

function createMockContext(): AppContext {
  return {
    db: {
      prepare: vi.fn().mockReturnValue({
        get: vi.fn().mockReturnValue({ c: 42 }),
        all: vi.fn().mockReturnValue([]),
      }),
      exec: vi.fn(),
    },
    config: {
      mcp: { servers: {} },
    },
    audit: {
      getTotalCost: vi.fn().mockReturnValue(1.2345),
      getRecentActions: vi.fn().mockReturnValue([]),
      logAction: vi.fn(),
    },
    router: {},
  } as unknown as AppContext;
}

let output: string[];

beforeEach(() => {
  vi.clearAllMocks();
  output = [];
  vi.spyOn(process.stdout, 'write').mockImplementation((text: string | Uint8Array) => {
    output.push(String(text));
    return true;
  });
});

describe('statusAction', () => {
  it('prints entity, event, observation, task counts and total cost', () => {
    const ctx = createMockContext();
    statusAction(ctx);

    const joined = output.join('');
    expect(joined).toContain('Sauria Status');
    expect(joined).toContain('Entities:');
    expect(joined).toContain('42');
    expect(joined).toContain('$1.2345');
  });
});

describe('askAction', () => {
  it('searches by keyword and reasons about the result', async () => {
    const ctx = createMockContext();
    vi.mocked(searchByKeyword).mockReturnValue([
      {
        id: 'e1',
        type: 'person',
        name: 'Alice',
        summary: 'Engineer',
        properties: null,
        importanceScore: 5,
        firstSeenAt: '2026-01-01',
        lastUpdatedAt: '2026-01-01',
        lastMentionedAt: null,
        mentionCount: 1,
      },
    ]);

    await askAction(ctx, 'Who is Alice?');

    expect(searchByKeyword).toHaveBeenCalledWith(ctx.db, 'Who is Alice?', 10);
    expect(reasonAbout).toHaveBeenCalled();
    const joined = output.join('');
    expect(joined).toContain('AI analysis result');
  });
});

describe('focusAction', () => {
  it('prints not found when entity does not exist', async () => {
    const ctx = createMockContext();
    vi.mocked(getEntityByName).mockReturnValue(undefined);
    vi.mocked(searchEntities).mockReturnValue([]);

    await focusAction(ctx, 'NonExistent');

    const joined = output.join('');
    expect(joined).toContain('not found');
  });

  it('prints entity details and analysis when found', async () => {
    const ctx = createMockContext();
    const entity = {
      id: 'e1',
      type: 'person' as const,
      name: 'Alice',
      summary: 'Engineer',
      properties: null,
      importanceScore: 8,
      firstSeenAt: '2026-01-01',
      lastUpdatedAt: '2026-01-01',
      lastMentionedAt: null,
      mentionCount: 5,
    };
    vi.mocked(getEntityByName).mockReturnValue(entity);
    vi.mocked(getEntityRelations).mockReturnValue([]);
    vi.mocked(getEntityTimeline).mockReturnValue([]);

    await focusAction(ctx, 'Alice');

    const joined = output.join('');
    expect(joined).toContain('Alice');
    expect(joined).toContain('AI analysis result');
  });
});

describe('entityAction', () => {
  it('prints not found when entity does not exist', () => {
    const ctx = createMockContext();
    vi.mocked(getEntityByName).mockReturnValue(undefined);
    vi.mocked(searchEntities).mockReturnValue([]);

    entityAction(ctx, 'Ghost');

    const joined = output.join('');
    expect(joined).toContain('not found');
  });

  it('prints full entity details with relations and timeline', () => {
    const ctx = createMockContext();
    const entity = {
      id: 'e1',
      type: 'person' as const,
      name: 'Bob',
      summary: 'Manager',
      properties: { role: 'lead' },
      importanceScore: 7,
      firstSeenAt: '2026-01-01',
      lastUpdatedAt: '2026-01-02',
      lastMentionedAt: '2026-01-02',
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
        source: 'telegram',
        eventType: 'message',
        contentHash: null,
        parsedData: null,
        entityIds: ['e1'],
        timestamp: '2026-01-02T10:00:00Z',
        processedAt: null,
        importance: 5,
      },
    ]);

    entityAction(ctx, 'Bob');

    const joined = output.join('');
    expect(joined).toContain('Bob (person)');
    expect(joined).toContain('Importance: 7');
    expect(joined).toContain('Properties:');
    expect(joined).toContain('works_with');
    expect(joined).toContain('message');
  });

  it('falls back to searchEntities when getEntityByName returns undefined', () => {
    const ctx = createMockContext();
    const entity = {
      id: 'e1',
      type: 'person' as const,
      name: 'Carol',
      summary: null,
      properties: null,
      importanceScore: 3,
      firstSeenAt: '2026-01-01',
      lastUpdatedAt: '2026-01-01',
      lastMentionedAt: null,
      mentionCount: 1,
    };
    vi.mocked(getEntityByName).mockReturnValue(undefined);
    vi.mocked(searchEntities).mockReturnValue([entity]);
    vi.mocked(getEntityRelations).mockReturnValue([]);
    vi.mocked(getEntityTimeline).mockReturnValue([]);

    entityAction(ctx, 'Carol');

    const joined = output.join('');
    expect(joined).toContain('Carol');
  });
});

describe('upcomingAction', () => {
  it('prints message when no deadlines', () => {
    const ctx = createMockContext();
    vi.mocked(getUpcomingDeadlines).mockReturnValue([]);

    upcomingAction(ctx, 24);

    const joined = output.join('');
    expect(joined).toContain('No upcoming deadlines');
  });

  it('prints deadlines when they exist', () => {
    const ctx = createMockContext();
    vi.mocked(getUpcomingDeadlines).mockReturnValue([
      {
        id: 'ev1',
        source: 'calendar',
        eventType: 'meeting',
        contentHash: null,
        parsedData: null,
        entityIds: [],
        timestamp: '2026-03-11T10:00:00Z',
        processedAt: null,
        importance: 5,
      },
    ]);

    upcomingAction(ctx, 48);

    const joined = output.join('');
    expect(joined).toContain('Upcoming');
    expect(joined).toContain('meeting');
  });
});

describe('insightsAction', () => {
  it('prints message when no insights', () => {
    const ctx = createMockContext();
    insightsAction(ctx);

    const joined = output.join('');
    expect(joined).toContain('No insights generated yet');
  });

  it('prints insights when they exist', () => {
    const ctx = createMockContext();
    const mockPrepare = vi.fn().mockReturnValue({
      get: vi.fn(),
      all: vi.fn().mockReturnValue([
        { content: 'Pattern found', confidence: 0.85, created_at: '2026-03-10' },
      ]),
    });
    (ctx.db as unknown as { prepare: typeof mockPrepare }).prepare = mockPrepare;

    insightsAction(ctx);

    const joined = output.join('');
    expect(joined).toContain('Recent Insights');
    expect(joined).toContain('Pattern found');
  });
});

describe('teachAction', () => {
  it('logs the fact and prints confirmation', () => {
    const ctx = createMockContext();
    teachAction(ctx, 'Alice likes coffee');

    const joined = output.join('');
    expect(joined).toContain('Noted:');
    expect(joined).toContain('Alice likes coffee');
    expect(ctx.audit.logAction).toHaveBeenCalledWith('cli:teach_requested', {
      fact: 'Alice likes coffee',
    });
  });
});

describe('sourcesAction', () => {
  it('prints message when no MCP sources', () => {
    const ctx = createMockContext();
    sourcesAction(ctx);

    const joined = output.join('');
    expect(joined).toContain('No MCP sources configured');
  });

  it('prints configured sources', () => {
    const ctx = createMockContext();
    (ctx.config as unknown as { mcp: { servers: Record<string, unknown> } }).mcp.servers = {
      github: { command: 'npx', args: ['-y', 'github-mcp'], interval: 300 },
    };

    sourcesAction(ctx);

    const joined = output.join('');
    expect(joined).toContain('github');
    expect(joined).toContain('npx');
    expect(joined).toContain('300');
  });
});

describe('auditAction', () => {
  it('prints message when no audit entries', () => {
    const ctx = createMockContext();
    auditAction(ctx, 20);

    const joined = output.join('');
    expect(joined).toContain('No audit entries');
  });

  it('prints audit entries with cost and status', () => {
    const ctx = createMockContext();
    vi.mocked(ctx.audit.getRecentActions).mockReturnValue([
      {
        id: 'a1',
        action: 'llm_call',
        timestamp: '2026-03-10T12:00:00Z',
        success: true,
        costUsd: 0.0012,
        details: null,
      },
      {
        id: 'a2',
        action: 'channel_error',
        timestamp: '2026-03-10T12:01:00Z',
        success: false,
        costUsd: null,
        details: null,
      },
    ] as never);

    auditAction(ctx, 20);

    const joined = output.join('');
    expect(joined).toContain('llm_call');
    expect(joined).toContain('OK');
    expect(joined).toContain('FAIL');
    expect(joined).toContain('$0.0012');
  });
});

describe('exportAction', () => {
  it('prints JSON export of all tables', () => {
    const ctx = createMockContext();
    exportAction(ctx);

    const joined = output.join('');
    const parsed = JSON.parse(joined.trim());
    expect(parsed).toHaveProperty('entities');
    expect(parsed).toHaveProperty('relations');
    expect(parsed).toHaveProperty('events');
    expect(parsed).toHaveProperty('observations');
    expect(parsed).toHaveProperty('exportedAt');
  });
});

describe('purgeAction', () => {
  it('prints warning and does not purge without --confirm', () => {
    const ctx = createMockContext();
    const originalArgv = process.argv;
    process.argv = ['node', 'sauria', 'purge'];

    purgeAction(ctx);

    const joined = output.join('');
    expect(joined).toContain('WARNING');
    expect(ctx.db.exec).not.toHaveBeenCalled();
    process.argv = originalArgv;
  });

  it('purges all data when --confirm is present', () => {
    const ctx = createMockContext();
    const originalArgv = process.argv;
    process.argv = ['node', 'sauria', 'purge', '--confirm'];

    purgeAction(ctx);

    const joined = output.join('');
    expect(joined).toContain('All data purged');
    expect(ctx.db.exec).toHaveBeenCalledTimes(6);
    expect(ctx.audit.logAction).toHaveBeenCalledWith('purge', expect.any(Object));
    process.argv = originalArgv;
  });
});
