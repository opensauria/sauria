import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb } from '../../__tests__/helpers/db.js';
import { sanitizeFtsQuery, searchByKeyword, searchByVector, hybridSearch } from '../search.js';
import { storeEmbedding } from '../search-vectors.js';
import { upsertEntity } from '../world-model.js';

describe('search', () => {
  describe('sanitizeFtsQuery', () => {
    it('wraps single term in quotes', () => {
      expect(sanitizeFtsQuery('hello')).toBe('"hello"');
    });

    it('wraps multiple terms individually', () => {
      expect(sanitizeFtsQuery('hello world')).toBe('"hello" "world"');
    });

    it('strips FTS5 special characters', () => {
      expect(sanitizeFtsQuery('hello? world*')).toBe('"hello" "world"');
    });

    it('returns empty string for whitespace-only input', () => {
      expect(sanitizeFtsQuery('   ')).toBe('');
    });

    it('returns empty string for special-characters-only input', () => {
      expect(sanitizeFtsQuery('?*+()')).toBe('');
    });

    it('handles mixed special characters and valid terms', () => {
      expect(sanitizeFtsQuery('"alice" OR bob')).toBe('"alice" "OR" "bob"');
    });
  });

  describe('searchByKeyword', () => {
    let db: Database.Database;

    beforeEach(() => {
      db = createTestDb();
    });

    afterEach(() => {
      db.close();
    });

    it('returns entities matching name via FTS', () => {
      upsertEntity(db, { id: 'e1', type: 'person', name: 'Alice Johnson' });
      upsertEntity(db, { id: 'e2', type: 'person', name: 'Bob Smith' });
      upsertEntity(db, { id: 'e3', type: 'company', name: 'Johnson Inc' });

      const results = searchByKeyword(db, 'Johnson');
      expect(results.length).toBeGreaterThanOrEqual(1);
      const ids = results.map((r) => r.id);
      expect(ids).toContain('e1');
      expect(ids).toContain('e3');
    });

    it('returns entities matching summary via FTS', () => {
      upsertEntity(db, {
        id: 'e1',
        type: 'person',
        name: 'Alice',
        summary: 'Expert in machine learning',
      });
      upsertEntity(db, { id: 'e2', type: 'person', name: 'Bob', summary: 'Sales manager' });

      const results = searchByKeyword(db, 'machine');
      expect(results).toHaveLength(1);
      expect(results[0]?.id).toBe('e1');
    });

    it('returns empty array when no matches', () => {
      upsertEntity(db, { id: 'e1', type: 'person', name: 'Alice' });
      const results = searchByKeyword(db, 'zzzznoexist');
      expect(results).toEqual([]);
    });

    it('returns empty array for empty query', () => {
      upsertEntity(db, { id: 'e1', type: 'person', name: 'Alice' });
      const results = searchByKeyword(db, '');
      expect(results).toEqual([]);
    });

    it('respects limit parameter', () => {
      for (let i = 0; i < 5; i++) {
        upsertEntity(db, { id: `e${i}`, type: 'person', name: `Agent Alpha ${i}` });
      }

      const results = searchByKeyword(db, 'Agent', 2);
      expect(results).toHaveLength(2);
    });

    it('finds entities after name update via FTS trigger', () => {
      upsertEntity(db, { id: 'e1', type: 'person', name: 'Alice' });
      upsertEntity(db, { id: 'e1', type: 'person', name: 'Wonderland' });

      const oldResults = searchByKeyword(db, 'Alice');
      expect(oldResults).toHaveLength(0);

      const newResults = searchByKeyword(db, 'Wonderland');
      expect(newResults).toHaveLength(1);
      expect(newResults[0]?.id).toBe('e1');
    });
  });

  describe('searchByVector', () => {
    let db: Database.Database;

    beforeEach(() => {
      db = createTestDb();
    });

    afterEach(() => {
      db.close();
    });

    it('returns entities ordered by cosine similarity', () => {
      upsertEntity(db, { id: 'e1', type: 'person', name: 'Alice' });
      upsertEntity(db, { id: 'e2', type: 'person', name: 'Bob' });

      const vec1 = new Float32Array([1, 0, 0]);
      const vec2 = new Float32Array([0, 1, 0]);
      storeEmbedding(db, 'e1', vec1, 'test-model');
      storeEmbedding(db, 'e2', vec2, 'test-model');

      const query = new Float32Array([1, 0, 0]);
      const results = searchByVector(db, query);
      expect(results).toHaveLength(2);
      expect(results[0]?.id).toBe('e1');
    });

    it('returns empty array when no embeddings exist', () => {
      upsertEntity(db, { id: 'e1', type: 'person', name: 'Alice' });
      const query = new Float32Array([1, 0, 0]);
      const results = searchByVector(db, query);
      expect(results).toEqual([]);
    });

    it('respects limit parameter', () => {
      for (let i = 0; i < 5; i++) {
        upsertEntity(db, { id: `e${i}`, type: 'person', name: `Agent ${i}` });
        storeEmbedding(db, `e${i}`, new Float32Array([i, 0, 0]), 'test');
      }

      const query = new Float32Array([4, 0, 0]);
      const results = searchByVector(db, query, 2);
      expect(results).toHaveLength(2);
    });
  });

  describe('hybridSearch', () => {
    let db: Database.Database;

    beforeEach(() => {
      db = createTestDb();
    });

    afterEach(() => {
      db.close();
    });

    it('combines FTS and vector results', () => {
      upsertEntity(db, { id: 'e1', type: 'person', name: 'Alice Engineer' });
      upsertEntity(db, { id: 'e2', type: 'person', name: 'Bob Manager' });

      const vec1 = new Float32Array([1, 0, 0]);
      const vec2 = new Float32Array([0, 1, 0]);
      storeEmbedding(db, 'e1', vec1, 'test');
      storeEmbedding(db, 'e2', vec2, 'test');

      const query = new Float32Array([1, 0, 0]);
      const results = hybridSearch(db, 'Alice', query);
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0]?.id).toBe('e1');
    });

    it('works with null queryVector (FTS only)', () => {
      upsertEntity(db, { id: 'e1', type: 'person', name: 'Alice' });
      upsertEntity(db, { id: 'e2', type: 'person', name: 'Bob' });

      const results = hybridSearch(db, 'Alice', null);
      expect(results).toHaveLength(1);
      expect(results[0]?.id).toBe('e1');
    });

    it('returns empty results for empty query and no vector', () => {
      upsertEntity(db, { id: 'e1', type: 'person', name: 'Alice' });
      const results = hybridSearch(db, '', null);
      expect(results).toEqual([]);
    });

    it('returns vector-only results when FTS query is empty', () => {
      upsertEntity(db, { id: 'e1', type: 'person', name: 'Alice' });
      storeEmbedding(db, 'e1', new Float32Array([1, 0, 0]), 'test');

      const results = hybridSearch(db, '', new Float32Array([1, 0, 0]));
      expect(results).toHaveLength(1);
      expect(results[0]?.id).toBe('e1');
    });

    it('respects limit parameter', () => {
      for (let i = 0; i < 5; i++) {
        upsertEntity(db, { id: `e${i}`, type: 'person', name: `Agent Alpha ${i}` });
      }

      const results = hybridSearch(db, 'Agent', null, 2);
      expect(results).toHaveLength(2);
    });

    it('merges entities appearing in both FTS and vector results', () => {
      upsertEntity(db, {
        id: 'e1',
        type: 'person',
        name: 'Alice',
        summary: 'ML expert',
      });
      storeEmbedding(db, 'e1', new Float32Array([1, 0, 0]), 'test');

      const results = hybridSearch(db, 'Alice', new Float32Array([1, 0, 0]));
      expect(results).toHaveLength(1);
      expect(results[0]?.id).toBe('e1');
    });
  });
});
