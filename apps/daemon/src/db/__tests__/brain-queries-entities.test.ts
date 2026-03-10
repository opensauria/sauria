import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb } from '../../__tests__/helpers/db.js';
import { listEntities, getEntityDetail, listRelations } from '../brain-queries-entities.js';

function seedEntities(db: Database.Database): void {
  db.prepare(
    "INSERT INTO entities (id, type, name, summary, importance_score) VALUES ('e1', 'person', 'Alice Smith', 'Software engineer', 0.9)",
  ).run();
  db.prepare(
    "INSERT INTO entities (id, type, name, summary, importance_score) VALUES ('e2', 'company', 'Acme Corp', 'Tech company', 0.7)",
  ).run();
  db.prepare(
    "INSERT INTO entities (id, type, name, summary, importance_score) VALUES ('e3', 'person', 'Bob Jones', 'Designer', 0.5)",
  ).run();
}

function seedRelations(db: Database.Database): void {
  seedEntities(db);
  db.prepare(
    "INSERT INTO relations (id, from_entity_id, to_entity_id, type, strength) VALUES ('r1', 'e1', 'e2', 'works_at', 0.8)",
  ).run();
  db.prepare(
    "INSERT INTO relations (id, from_entity_id, to_entity_id, type, strength) VALUES ('r2', 'e1', 'e3', 'knows', 0.6)",
  ).run();
}

describe('brain-queries-entities', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    db.close();
  });

  describe('listEntities', () => {
    it('returns empty result for empty table', () => {
      const result = listEntities(db);
      expect(result.rows).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('returns all entities without filters', () => {
      seedEntities(db);
      const result = listEntities(db);
      expect(result.total).toBe(3);
      expect(result.rows).toHaveLength(3);
    });

    it('orders by importance_score DESC', () => {
      seedEntities(db);
      const result = listEntities(db);
      const scores = result.rows.map((r) => r['importance_score'] as number);
      expect(scores[0]).toBeGreaterThanOrEqual(scores[1]!);
      expect(scores[1]).toBeGreaterThanOrEqual(scores[2]!);
    });

    it('filters by type', () => {
      seedEntities(db);
      const result = listEntities(db, { type: 'person' });
      expect(result.total).toBe(2);
      expect(result.rows.every((r) => r['type'] === 'person')).toBe(true);
    });

    it('filters by FTS search', () => {
      seedEntities(db);
      const result = listEntities(db, { search: 'Alice' });
      expect(result.total).toBe(1);
      expect((result.rows[0] as Record<string, unknown>)['name']).toBe('Alice Smith');
    });

    it('combines search and type filters', () => {
      seedEntities(db);
      const result = listEntities(db, { search: 'Alice', type: 'person' });
      expect(result.total).toBe(1);
    });

    it('returns empty for search with wrong type', () => {
      seedEntities(db);
      const result = listEntities(db, { search: 'Alice', type: 'company' });
      expect(result.total).toBe(0);
    });

    it('returns empty for empty FTS query after sanitization', () => {
      seedEntities(db);
      const result = listEntities(db, { search: '??**' });
      expect(result.total).toBe(0);
      expect(result.rows).toEqual([]);
    });

    it('respects limit and offset', () => {
      seedEntities(db);
      const result = listEntities(db, { limit: 2, offset: 1 });
      expect(result.total).toBe(3);
      expect(result.rows).toHaveLength(2);
    });
  });

  describe('getEntityDetail', () => {
    it('returns null for nonexistent entity', () => {
      expect(getEntityDetail(db, 'nonexistent')).toBeNull();
    });

    it('returns entity with relations and events', () => {
      seedRelations(db);
      db.prepare(
        `INSERT INTO events (id, source, event_type, entity_ids, timestamp)
         VALUES ('ev1', 'test', 'meeting', '["e1","e2"]', '2026-01-01')`,
      ).run();

      const detail = getEntityDetail(db, 'e1');
      expect(detail).not.toBeNull();
      expect(detail!.entity['name']).toBe('Alice Smith');
      expect(detail!.relations).toHaveLength(2);
      expect(detail!.events).toHaveLength(1);
    });

    it('returns entity with empty relations and events', () => {
      seedEntities(db);
      const detail = getEntityDetail(db, 'e3');
      expect(detail).not.toBeNull();
      expect(detail!.relations).toEqual([]);
      expect(detail!.events).toEqual([]);
    });

    it('includes from_name and to_name in relations', () => {
      seedRelations(db);
      const detail = getEntityDetail(db, 'e1');
      const relation = detail!.relations[0] as Record<string, unknown>;
      expect(relation['from_name']).toBeDefined();
      expect(relation['to_name']).toBeDefined();
    });
  });

  describe('listRelations', () => {
    it('returns empty result for empty table', () => {
      const result = listRelations(db);
      expect(result.rows).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('returns all relations without filters', () => {
      seedRelations(db);
      const result = listRelations(db);
      expect(result.total).toBe(2);
      expect(result.rows).toHaveLength(2);
    });

    it('filters by type', () => {
      seedRelations(db);
      const result = listRelations(db, { type: 'works_at' });
      expect(result.total).toBe(1);
    });

    it('filters by search across entity names and relation type', () => {
      seedRelations(db);
      const result = listRelations(db, { search: 'Acme' });
      expect(result.total).toBe(1);
    });

    it('combines type and search filters', () => {
      seedRelations(db);
      const result = listRelations(db, { type: 'works_at', search: 'Alice' });
      expect(result.total).toBe(1);
    });

    it('returns empty for non-matching search', () => {
      seedRelations(db);
      const result = listRelations(db, { search: 'nonexistent_xyz' });
      expect(result.total).toBe(0);
    });

    it('orders by strength DESC', () => {
      seedRelations(db);
      const result = listRelations(db);
      const strengths = result.rows.map((r) => r['strength'] as number);
      expect(strengths[0]).toBeGreaterThanOrEqual(strengths[1]!);
    });

    it('respects limit and offset', () => {
      seedRelations(db);
      const result = listRelations(db, { limit: 1, offset: 0 });
      expect(result.total).toBe(2);
      expect(result.rows).toHaveLength(1);
    });
  });
});
