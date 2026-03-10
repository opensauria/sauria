import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb } from '../../__tests__/helpers/db.js';
import { listObservations } from '../brain-queries-observations.js';

function seedObservations(db: Database.Database): void {
  db.prepare(
    "INSERT INTO observations (id, type, content, created_at) VALUES ('o1', 'fact', 'User prefers dark mode', '2026-01-01')",
  ).run();
  db.prepare(
    "INSERT INTO observations (id, type, content, created_at) VALUES ('o2', 'pattern', 'Always responds quickly in mornings', '2026-01-02')",
  ).run();
  db.prepare(
    "INSERT INTO observations (id, type, content, created_at) VALUES ('o3', 'fact', 'Speaks three languages fluently', '2026-01-03')",
  ).run();
}

describe('brain-queries-observations', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    db.close();
  });

  describe('listObservations', () => {
    it('returns empty result for empty table', () => {
      const result = listObservations(db);
      expect(result.rows).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('returns all observations without filters', () => {
      seedObservations(db);
      const result = listObservations(db);
      expect(result.total).toBe(3);
      expect(result.rows).toHaveLength(3);
    });

    it('orders by created_at DESC', () => {
      seedObservations(db);
      const result = listObservations(db);
      const dates = result.rows.map((r) => r['created_at'] as string);
      expect(dates[0]! >= dates[1]!).toBe(true);
      expect(dates[1]! >= dates[2]!).toBe(true);
    });

    it('filters by type', () => {
      seedObservations(db);
      const result = listObservations(db, { type: 'fact' });
      expect(result.total).toBe(2);
      expect(result.rows.every((r) => r['type'] === 'fact')).toBe(true);
    });

    it('filters by FTS search', () => {
      seedObservations(db);
      const result = listObservations(db, { search: 'dark mode' });
      expect(result.total).toBe(1);
      expect((result.rows[0] as Record<string, unknown>)['id']).toBe('o1');
    });

    it('combines search and type filters', () => {
      seedObservations(db);
      const result = listObservations(db, { search: 'languages', type: 'fact' });
      expect(result.total).toBe(1);
    });

    it('returns empty for search with wrong type', () => {
      seedObservations(db);
      const result = listObservations(db, { search: 'languages', type: 'pattern' });
      expect(result.total).toBe(0);
    });

    it('returns empty for sanitized-away FTS query', () => {
      seedObservations(db);
      const result = listObservations(db, { search: '***' });
      expect(result.total).toBe(0);
      expect(result.rows).toEqual([]);
    });

    it('respects limit and offset', () => {
      seedObservations(db);
      const result = listObservations(db, { limit: 1, offset: 1 });
      expect(result.total).toBe(3);
      expect(result.rows).toHaveLength(1);
    });

    it('respects limit and offset with type filter', () => {
      seedObservations(db);
      const result = listObservations(db, { type: 'fact', limit: 1, offset: 0 });
      expect(result.total).toBe(2);
      expect(result.rows).toHaveLength(1);
    });
  });
});
