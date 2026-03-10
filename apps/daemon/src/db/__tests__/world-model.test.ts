import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb } from '../../__tests__/helpers/db.js';
import {
  upsertEntity,
  upsertRelation,
  recordEvent,
  addObservation,
  getEntity,
  getEntityByName,
  getEntityRelations,
  getEntityTimeline,
  searchEntities,
} from '../world-model.js';

describe('world-model', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    db.close();
  });

  describe('upsertEntity', () => {
    it('inserts a new entity', () => {
      upsertEntity(db, {
        id: 'e1',
        type: 'person',
        name: 'Alice',
        summary: 'Engineer at Acme',
      });

      const entity = getEntity(db, 'e1');
      expect(entity).toBeDefined();
      expect(entity?.name).toBe('Alice');
      expect(entity?.type).toBe('person');
      expect(entity?.summary).toBe('Engineer at Acme');
      expect(entity?.mentionCount).toBe(1);
    });

    it('updates an existing entity on conflict and increments mention_count', () => {
      upsertEntity(db, {
        id: 'e1',
        type: 'person',
        name: 'Alice',
        summary: 'Engineer',
      });

      upsertEntity(db, {
        id: 'e1',
        type: 'person',
        name: 'Alice Updated',
        summary: 'Senior Engineer',
      });

      const entity = getEntity(db, 'e1');
      expect(entity?.name).toBe('Alice Updated');
      expect(entity?.summary).toBe('Senior Engineer');
      expect(entity?.mentionCount).toBe(2);
    });

    it('preserves existing summary when new summary is undefined', () => {
      upsertEntity(db, {
        id: 'e1',
        type: 'person',
        name: 'Alice',
        summary: 'Engineer',
      });

      upsertEntity(db, {
        id: 'e1',
        type: 'person',
        name: 'Alice',
      });

      const entity = getEntity(db, 'e1');
      expect(entity?.summary).toBe('Engineer');
    });

    it('stores and retrieves properties as JSON', () => {
      upsertEntity(db, {
        id: 'e1',
        type: 'company',
        name: 'Acme Corp',
        properties: { industry: 'tech', size: 'large' },
      });

      const entity = getEntity(db, 'e1');
      expect(entity?.properties).toEqual({ industry: 'tech', size: 'large' });
    });

    it('defaults importanceScore to 0.5', () => {
      upsertEntity(db, {
        id: 'e1',
        type: 'person',
        name: 'Alice',
      });

      const entity = getEntity(db, 'e1');
      expect(entity?.importanceScore).toBe(0.5);
    });

    it('uses provided importanceScore', () => {
      upsertEntity(db, {
        id: 'e1',
        type: 'person',
        name: 'Alice',
        importanceScore: 0.9,
      });

      const entity = getEntity(db, 'e1');
      expect(entity?.importanceScore).toBe(0.9);
    });
  });

  describe('upsertRelation', () => {
    it('inserts a new relation', () => {
      upsertEntity(db, { id: 'e1', type: 'person', name: 'Alice' });
      upsertEntity(db, { id: 'e2', type: 'company', name: 'Acme' });

      upsertRelation(db, {
        id: 'r1',
        fromEntityId: 'e1',
        toEntityId: 'e2',
        type: 'works_at',
        strength: 0.8,
        context: 'Full-time employee',
      });

      const relations = getEntityRelations(db, 'e1');
      expect(relations).toHaveLength(1);
      expect(relations[0]?.type).toBe('works_at');
      expect(relations[0]?.strength).toBe(0.8);
      expect(relations[0]?.context).toBe('Full-time employee');
    });

    it('updates strength and context on conflict', () => {
      upsertEntity(db, { id: 'e1', type: 'person', name: 'Alice' });
      upsertEntity(db, { id: 'e2', type: 'company', name: 'Acme' });

      upsertRelation(db, {
        id: 'r1',
        fromEntityId: 'e1',
        toEntityId: 'e2',
        type: 'works_at',
        strength: 0.5,
      });

      upsertRelation(db, {
        id: 'r2',
        fromEntityId: 'e1',
        toEntityId: 'e2',
        type: 'works_at',
        strength: 0.9,
        context: 'Promoted to lead',
      });

      const relations = getEntityRelations(db, 'e1');
      expect(relations).toHaveLength(1);
      expect(relations[0]?.strength).toBe(0.9);
      expect(relations[0]?.context).toBe('Promoted to lead');
    });

    it('defaults strength to 0.5', () => {
      upsertEntity(db, { id: 'e1', type: 'person', name: 'Alice' });
      upsertEntity(db, { id: 'e2', type: 'person', name: 'Bob' });

      upsertRelation(db, {
        id: 'r1',
        fromEntityId: 'e1',
        toEntityId: 'e2',
        type: 'knows',
      });

      const relations = getEntityRelations(db, 'e1');
      expect(relations[0]?.strength).toBe(0.5);
    });
  });

  describe('getEntityByName', () => {
    it('retrieves entity by exact name', () => {
      upsertEntity(db, { id: 'e1', type: 'person', name: 'Alice' });
      upsertEntity(db, { id: 'e2', type: 'person', name: 'Bob' });

      const entity = getEntityByName(db, 'Bob');
      expect(entity?.id).toBe('e2');
    });

    it('returns undefined for non-existent name', () => {
      const entity = getEntityByName(db, 'Nobody');
      expect(entity).toBeUndefined();
    });
  });

  describe('getEntityRelations', () => {
    it('returns relations where entity is source or target', () => {
      upsertEntity(db, { id: 'e1', type: 'person', name: 'Alice' });
      upsertEntity(db, { id: 'e2', type: 'person', name: 'Bob' });
      upsertEntity(db, { id: 'e3', type: 'company', name: 'Acme' });

      upsertRelation(db, {
        id: 'r1',
        fromEntityId: 'e1',
        toEntityId: 'e2',
        type: 'knows',
      });
      upsertRelation(db, {
        id: 'r2',
        fromEntityId: 'e3',
        toEntityId: 'e1',
        type: 'employs',
      });

      const relations = getEntityRelations(db, 'e1');
      expect(relations).toHaveLength(2);
    });

    it('returns empty array when no relations exist', () => {
      upsertEntity(db, { id: 'e1', type: 'person', name: 'Alice' });
      const relations = getEntityRelations(db, 'e1');
      expect(relations).toEqual([]);
    });
  });

  describe('recordEvent', () => {
    it('inserts an event and retrieves it via entity timeline', () => {
      upsertEntity(db, { id: 'e1', type: 'person', name: 'Alice' });

      recordEvent(db, {
        id: 'ev1',
        source: 'telegram',
        eventType: 'message',
        contentHash: 'hash1',
        entityIds: ['e1'],
        timestamp: new Date().toISOString(),
      });

      const timeline = getEntityTimeline(db, 'e1');
      expect(timeline).toHaveLength(1);
      expect(timeline[0]?.source).toBe('telegram');
      expect(timeline[0]?.eventType).toBe('message');
    });

    it('ignores duplicate events with same id', () => {
      recordEvent(db, {
        id: 'ev1',
        source: 'telegram',
        eventType: 'message',
        contentHash: 'hash1',
        timestamp: new Date().toISOString(),
      });

      recordEvent(db, {
        id: 'ev1',
        source: 'slack',
        eventType: 'update',
        contentHash: 'hash2',
        timestamp: new Date().toISOString(),
      });

      const row = db.prepare('SELECT * FROM events WHERE id = ?').get('ev1') as Record<
        string,
        unknown
      >;
      expect(row['source']).toBe('telegram');
    });
  });

  describe('addObservation', () => {
    it('inserts an observation', () => {
      addObservation(db, {
        id: 'o1',
        type: 'fact',
        content: 'Alice works at Acme',
        confidence: 0.9,
        entityIds: ['e1'],
      });

      const row = db.prepare('SELECT * FROM observations WHERE id = ?').get('o1') as Record<
        string,
        unknown
      >;
      expect(row['content']).toBe('Alice works at Acme');
      expect(row['confidence']).toBe(0.9);
    });
  });

  describe('searchEntities (FTS)', () => {
    it('finds entities matching by name', () => {
      upsertEntity(db, { id: 'e1', type: 'person', name: 'Alice Johnson' });
      upsertEntity(db, { id: 'e2', type: 'person', name: 'Bob Smith' });

      const results = searchEntities(db, 'Alice');
      expect(results).toHaveLength(1);
      expect(results[0]?.id).toBe('e1');
    });

    it('returns empty array for non-matching query', () => {
      upsertEntity(db, { id: 'e1', type: 'person', name: 'Alice' });
      const results = searchEntities(db, 'zzzznoexist');
      expect(results).toEqual([]);
    });
  });
});
