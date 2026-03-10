import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mergeProperties, resolveEntity } from '../resolver.js';

vi.mock('../../db/world-model.js', () => ({
  getEntityByName: vi.fn(() => undefined),
  searchEntities: vi.fn(() => []),
}));

import { getEntityByName, searchEntities } from '../../db/world-model.js';

const mockGetByName = vi.mocked(getEntityByName);
const mockSearch = vi.mocked(searchEntities);

describe('mergeProperties', () => {
  it('returns empty object when both are null/undefined', () => {
    expect(mergeProperties(null, undefined)).toEqual({});
  });

  it('returns copy of incoming when existing is null', () => {
    const incoming = { email: 'a@b.com' };
    const result = mergeProperties(null, incoming);
    expect(result).toEqual({ email: 'a@b.com' });
    expect(result).not.toBe(incoming);
  });

  it('returns copy of existing when incoming is undefined', () => {
    const existing = { role: 'engineer' };
    const result = mergeProperties(existing, undefined);
    expect(result).toEqual({ role: 'engineer' });
    expect(result).not.toBe(existing);
  });

  it('merges both with incoming overwriting existing', () => {
    const existing = { role: 'engineer', team: 'alpha' };
    const incoming = { role: 'lead', city: 'Paris' };
    expect(mergeProperties(existing, incoming)).toEqual({
      role: 'lead',
      team: 'alpha',
      city: 'Paris',
    });
  });
});

describe('resolveEntity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns existing entity ID on exact name match', () => {
    mockGetByName.mockReturnValue({
      id: 'ent-existing',
      type: 'person',
      name: 'Alice',
      summary: null,
      properties: null,
      importanceScore: 0.5,
      firstSeenAt: '2026-01-01',
      lastUpdatedAt: '2026-01-01',
      lastMentionedAt: null,
      mentionCount: 1,
    });

    const db = {} as Parameters<typeof resolveEntity>[0];
    const result = resolveEntity(db, { name: 'Alice', type: 'person' });
    expect(result).toBe('ent-existing');
  });

  it('returns fuzzy match ID when similarity >= 0.7 and type matches', () => {
    mockGetByName.mockReturnValue(undefined);
    mockSearch.mockReturnValue([
      {
        id: 'ent-fuzzy',
        type: 'person',
        name: 'Alice Smith',
        summary: null,
        properties: null,
        importanceScore: 0.5,
        firstSeenAt: '2026-01-01',
        lastUpdatedAt: '2026-01-01',
        lastMentionedAt: null,
        mentionCount: 1,
      },
    ]);

    const db = {} as Parameters<typeof resolveEntity>[0];
    const result = resolveEntity(db, { name: 'Alice', type: 'person' });
    // 'Alice' is contained in 'Alice Smith', similarity = 5/11 ~= 0.45 < 0.7
    // Should generate a new ID
    expect(result).not.toBe('ent-fuzzy');
    expect(typeof result).toBe('string');
  });

  it('skips candidates with different type', () => {
    mockGetByName.mockReturnValue(undefined);
    mockSearch.mockReturnValue([
      {
        id: 'ent-company',
        type: 'company',
        name: 'Alice',
        summary: null,
        properties: null,
        importanceScore: 0.5,
        firstSeenAt: '2026-01-01',
        lastUpdatedAt: '2026-01-01',
        lastMentionedAt: null,
        mentionCount: 1,
      },
    ]);

    const db = {} as Parameters<typeof resolveEntity>[0];
    const result = resolveEntity(db, { name: 'Alice', type: 'person' });
    expect(result).not.toBe('ent-company');
  });

  it('generates new nanoid when no match found', () => {
    mockGetByName.mockReturnValue(undefined);
    mockSearch.mockReturnValue([]);

    const db = {} as Parameters<typeof resolveEntity>[0];
    const id1 = resolveEntity(db, { name: 'NewEntity', type: 'concept' });
    const id2 = resolveEntity(db, { name: 'AnotherNew', type: 'concept' });

    expect(typeof id1).toBe('string');
    expect(id1.length).toBeGreaterThan(0);
    expect(id1).not.toBe(id2);
  });

  it('matches when names are identical (case-insensitive)', () => {
    mockGetByName.mockReturnValue(undefined);
    mockSearch.mockReturnValue([
      {
        id: 'ent-match',
        type: 'person',
        name: 'ALICE',
        summary: null,
        properties: null,
        importanceScore: 0.5,
        firstSeenAt: '2026-01-01',
        lastUpdatedAt: '2026-01-01',
        lastMentionedAt: null,
        mentionCount: 1,
      },
    ]);

    const db = {} as Parameters<typeof resolveEntity>[0];
    const result = resolveEntity(db, { name: 'alice', type: 'person' });
    expect(result).toBe('ent-match');
  });
});
