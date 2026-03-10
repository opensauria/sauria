import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb } from '../../__tests__/helpers/db.js';
import {
  cosineSimilarity,
  fetchEntitiesOrdered,
  scoreEmbeddings,
  storeEmbedding,
} from '../search-vectors.js';

function seedEntity(db: Database.Database, id: string, name: string): void {
  db.prepare(`INSERT INTO entities (id, type, name) VALUES (?, 'person', ?)`).run(id, name);
}

describe('search-vectors', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    db.close();
  });

  describe('cosineSimilarity', () => {
    it('returns 1 for identical vectors', () => {
      const a = new Float32Array([1, 2, 3]);
      const similarity = cosineSimilarity(a, a);
      expect(similarity).toBeCloseTo(1.0, 5);
    });

    it('returns 0 for orthogonal vectors', () => {
      const a = new Float32Array([1, 0]);
      const b = new Float32Array([0, 1]);
      expect(cosineSimilarity(a, b)).toBeCloseTo(0, 5);
    });

    it('returns -1 for opposite vectors', () => {
      const a = new Float32Array([1, 0]);
      const b = new Float32Array([-1, 0]);
      expect(cosineSimilarity(a, b)).toBeCloseTo(-1.0, 5);
    });

    it('returns 0 for different length vectors', () => {
      const a = new Float32Array([1, 2]);
      const b = new Float32Array([1, 2, 3]);
      expect(cosineSimilarity(a, b)).toBe(0);
    });

    it('returns 0 for zero vectors', () => {
      const a = new Float32Array([0, 0, 0]);
      const b = new Float32Array([1, 2, 3]);
      expect(cosineSimilarity(a, b)).toBe(0);
    });

    it('handles empty vectors', () => {
      const a = new Float32Array([]);
      const b = new Float32Array([]);
      expect(cosineSimilarity(a, b)).toBe(0);
    });
  });

  describe('storeEmbedding', () => {
    it('stores an embedding for an entity', () => {
      seedEntity(db, 'e1', 'Alice');
      const vector = new Float32Array([0.1, 0.2, 0.3]);
      storeEmbedding(db, 'e1', vector, 'test-model');

      const row = db.prepare('SELECT * FROM embeddings WHERE entity_id = ?').get('e1') as {
        entity_id: string;
        model: string;
        vector: Buffer;
      };
      expect(row.entity_id).toBe('e1');
      expect(row.model).toBe('test-model');
      expect(Buffer.isBuffer(row.vector)).toBe(true);
    });

    it('replaces existing embedding on conflict', () => {
      seedEntity(db, 'e1', 'Alice');
      storeEmbedding(db, 'e1', new Float32Array([0.1, 0.2]), 'model-a');
      storeEmbedding(db, 'e1', new Float32Array([0.9, 0.8]), 'model-b');

      const rows = db.prepare('SELECT * FROM embeddings WHERE entity_id = ?').all('e1');
      expect(rows).toHaveLength(1);
      expect((rows[0] as { model: string }).model).toBe('model-b');
    });
  });

  describe('scoreEmbeddings', () => {
    it('returns empty map for empty embeddings table', () => {
      const query = new Float32Array([1, 0, 0]);
      const scores = scoreEmbeddings(db, query);
      expect(scores.size).toBe(0);
    });

    it('scores all stored embeddings against query vector', () => {
      seedEntity(db, 'e1', 'Alice');
      seedEntity(db, 'e2', 'Bob');

      const v1 = new Float32Array([1, 0, 0]);
      const v2 = new Float32Array([0, 1, 0]);
      storeEmbedding(db, 'e1', v1, 'test');
      storeEmbedding(db, 'e2', v2, 'test');

      const query = new Float32Array([1, 0, 0]);
      const scores = scoreEmbeddings(db, query);

      expect(scores.size).toBe(2);
      expect(scores.get('e1')).toBeCloseTo(1.0, 5);
      expect(scores.get('e2')).toBeCloseTo(0, 5);
    });
  });

  describe('fetchEntitiesOrdered', () => {
    it('returns empty array for empty ids', () => {
      expect(fetchEntitiesOrdered(db, [])).toEqual([]);
    });

    it('returns entities in the order of provided ids', () => {
      seedEntity(db, 'e1', 'Alice');
      seedEntity(db, 'e2', 'Bob');
      seedEntity(db, 'e3', 'Carol');

      const entities = fetchEntitiesOrdered(db, ['e3', 'e1', 'e2']);
      expect(entities).toHaveLength(3);
      expect(entities[0]!.id).toBe('e3');
      expect(entities[1]!.id).toBe('e1');
      expect(entities[2]!.id).toBe('e2');
    });

    it('skips nonexistent ids', () => {
      seedEntity(db, 'e1', 'Alice');
      const entities = fetchEntitiesOrdered(db, ['e1', 'nonexistent']);
      expect(entities).toHaveLength(1);
      expect(entities[0]!.id).toBe('e1');
    });

    it('returns entities with correct domain fields', () => {
      seedEntity(db, 'e1', 'Alice');
      const entities = fetchEntitiesOrdered(db, ['e1']);
      expect(entities[0]!.name).toBe('Alice');
      expect(entities[0]!.type).toBe('person');
      expect(entities[0]!.mentionCount).toBe(1);
    });
  });
});
