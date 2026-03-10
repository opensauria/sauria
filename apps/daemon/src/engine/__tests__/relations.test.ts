import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { detectDecay } from '../relations.js';

vi.mock('../../db/temporal.js', () => ({
  getDecayingRelationships: vi.fn(() => []),
}));

import { getDecayingRelationships } from '../../db/temporal.js';

const mockGetDecaying = vi.mocked(getDecayingRelationships);

function makeEntity(overrides: Partial<{ id: string; name: string }> = {}) {
  return {
    id: overrides.id ?? 'ent-1',
    type: 'person' as const,
    name: overrides.name ?? 'Alice',
    summary: null,
    properties: null,
    importanceScore: 0.5,
    firstSeenAt: '2026-01-01T00:00:00Z',
    lastUpdatedAt: '2026-01-15T00:00:00Z',
    lastMentionedAt: '2026-01-15T00:00:00Z',
    mentionCount: 10,
  };
}

describe('detectDecay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns empty array when no decaying relationships', () => {
    mockGetDecaying.mockReturnValue([]);
    const alerts = detectDecay({} as Parameters<typeof detectDecay>[0]);
    expect(alerts).toEqual([]);
  });

  it('filters out relationships below MIN_DECAY_RATIO (1.5)', () => {
    mockGetDecaying.mockReturnValue([
      { entity: makeEntity(), daysSinceContact: 10, averageGapDays: 8 },
    ]);
    // ratio = 10/8 = 1.25 < 1.5
    const alerts = detectDecay({} as Parameters<typeof detectDecay>[0]);
    expect(alerts).toHaveLength(0);
  });

  it('classifies ratio > 3 as high priority', () => {
    mockGetDecaying.mockReturnValue([
      {
        entity: makeEntity({ name: 'Bob' }),
        daysSinceContact: 40,
        averageGapDays: 10,
      },
    ]);
    // ratio = 40/10 = 4.0 > 3
    const alerts = detectDecay({} as Parameters<typeof detectDecay>[0]);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.priority).toBe('high');
    expect(alerts[0]?.numericPriority).toBe(3);
    expect(alerts[0]?.title).toContain('Bob');
  });

  it('classifies ratio > 2 but <= 3 as medium priority', () => {
    mockGetDecaying.mockReturnValue([
      {
        entity: makeEntity({ name: 'Carol' }),
        daysSinceContact: 25,
        averageGapDays: 10,
      },
    ]);
    // ratio = 25/10 = 2.5
    const alerts = detectDecay({} as Parameters<typeof detectDecay>[0]);
    expect(alerts[0]?.priority).toBe('medium');
    expect(alerts[0]?.numericPriority).toBe(2);
  });

  it('classifies ratio >= 1.5 but <= 2 as low priority', () => {
    mockGetDecaying.mockReturnValue([
      {
        entity: makeEntity({ name: 'Dave' }),
        daysSinceContact: 18,
        averageGapDays: 10,
      },
    ]);
    // ratio = 18/10 = 1.8
    const alerts = detectDecay({} as Parameters<typeof detectDecay>[0]);
    expect(alerts[0]?.priority).toBe('low');
    expect(alerts[0]?.numericPriority).toBe(1);
  });

  it('uses 999 decay ratio when averageGapDays is 0 and daysSinceContact > 14', () => {
    mockGetDecaying.mockReturnValue([
      {
        entity: makeEntity({ name: 'Eve' }),
        daysSinceContact: 20,
        averageGapDays: 0,
      },
    ]);
    const alerts = detectDecay({} as Parameters<typeof detectDecay>[0]);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.decayRatio).toBe(999);
    expect(alerts[0]?.priority).toBe('high');
  });

  it('uses 0 decay ratio when averageGapDays is 0 and daysSinceContact <= 14', () => {
    mockGetDecaying.mockReturnValue([
      {
        entity: makeEntity({ name: 'Frank' }),
        daysSinceContact: 10,
        averageGapDays: 0,
      },
    ]);
    // decayRatio = 0 < 1.5, filtered out
    const alerts = detectDecay({} as Parameters<typeof detectDecay>[0]);
    expect(alerts).toHaveLength(0);
  });

  it('sorts by decayRatio descending', () => {
    mockGetDecaying.mockReturnValue([
      {
        entity: makeEntity({ id: 'ent-a', name: 'A' }),
        daysSinceContact: 20,
        averageGapDays: 10,
      },
      {
        entity: makeEntity({ id: 'ent-b', name: 'B' }),
        daysSinceContact: 50,
        averageGapDays: 10,
      },
    ]);
    const alerts = detectDecay({} as Parameters<typeof detectDecay>[0]);
    expect(alerts).toHaveLength(2);
    expect(alerts[0]?.entityName).toBe('B');
    expect(alerts[1]?.entityName).toBe('A');
  });

  it('passes thresholdDays to getDecayingRelationships', () => {
    mockGetDecaying.mockReturnValue([]);
    const db = {} as Parameters<typeof detectDecay>[0];
    detectDecay(db, 30);
    expect(mockGetDecaying).toHaveBeenCalledWith(db, 30);
  });

  it('uses default threshold of 14 days', () => {
    mockGetDecaying.mockReturnValue([]);
    const db = {} as Parameters<typeof detectDecay>[0];
    detectDecay(db);
    expect(mockGetDecaying).toHaveBeenCalledWith(db, 14);
  });

  it('includes correct details in alert', () => {
    mockGetDecaying.mockReturnValue([
      {
        entity: makeEntity({ id: 'ent-x', name: 'Xavier' }),
        daysSinceContact: 30,
        averageGapDays: 10,
      },
    ]);
    const alerts = detectDecay({} as Parameters<typeof detectDecay>[0]);
    expect(alerts[0]?.details).toContain('30 days');
    expect(alerts[0]?.details).toContain('10 days');
    expect(alerts[0]?.entityId).toBe('ent-x');
    expect(alerts[0]?.daysSinceLastContact).toBe(30);
    expect(alerts[0]?.averageGapDays).toBe(10);
  });
});
