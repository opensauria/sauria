import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb } from '../../__tests__/helpers/db.js';
import {
  isRecord,
  isCountRow,
  sanitizeFtsQuery,
  getStats,
  DEFAULT_LIMIT,
} from '../brain-queries-shared.js';

describe('brain-queries-shared', () => {
  describe('isRecord', () => {
    it('returns true for plain objects', () => {
      expect(isRecord({})).toBe(true);
      expect(isRecord({ a: 1 })).toBe(true);
    });

    it('returns false for null', () => {
      expect(isRecord(null)).toBe(false);
    });

    it('returns false for arrays', () => {
      expect(isRecord([1, 2])).toBe(false);
    });

    it('returns false for primitives', () => {
      expect(isRecord('str')).toBe(false);
      expect(isRecord(42)).toBe(false);
      expect(isRecord(undefined)).toBe(false);
      expect(isRecord(true)).toBe(false);
    });
  });

  describe('isCountRow', () => {
    it('returns true for objects with numeric total', () => {
      expect(isCountRow({ total: 0 })).toBe(true);
      expect(isCountRow({ total: 42 })).toBe(true);
    });

    it('returns false when total is not a number', () => {
      expect(isCountRow({ total: '5' })).toBe(false);
      expect(isCountRow({})).toBe(false);
    });

    it('returns false for non-objects', () => {
      expect(isCountRow(null)).toBe(false);
      expect(isCountRow(undefined)).toBe(false);
    });
  });

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

    it('strips parentheses, braces, quotes, colons', () => {
      expect(sanitizeFtsQuery('foo{bar}:baz"qux"')).toBe('"foo" "bar" "baz" "qux"');
    });
  });

  describe('DEFAULT_LIMIT', () => {
    it('is 50', () => {
      expect(DEFAULT_LIMIT).toBe(50);
    });
  });

  describe('getStats', () => {
    let db: Database.Database;

    beforeEach(() => {
      db = createTestDb();
    });

    afterEach(() => {
      db.close();
    });

    it('returns zeroes for empty database', () => {
      const stats = getStats(db);
      expect(stats).toEqual({
        entities: 0,
        relations: 0,
        events: 0,
        observations: 0,
        conversations: 0,
        messages: 0,
        facts: 0,
        extractionFailures: 0,
      });
    });

    it('counts rows across all tables', () => {
      db.prepare(
        "INSERT INTO entities (id, type, name) VALUES ('e1', 'person', 'Alice')",
      ).run();
      db.prepare(
        "INSERT INTO entities (id, type, name) VALUES ('e2', 'person', 'Bob')",
      ).run();
      db.prepare(
        "INSERT INTO relations (id, from_entity_id, to_entity_id, type) VALUES ('r1', 'e1', 'e2', 'knows')",
      ).run();
      db.prepare(
        "INSERT INTO events (id, source, event_type, timestamp) VALUES ('ev1', 'test', 'meeting', '2026-01-01')",
      ).run();
      db.prepare(
        "INSERT INTO observations (id, type, content) VALUES ('o1', 'fact', 'some fact')",
      ).run();
      db.prepare(
        "INSERT INTO agent_conversations (id, platform) VALUES ('c1', 'telegram')",
      ).run();
      db.prepare(
        "INSERT INTO agent_messages (id, conversation_id, source_node_id, sender_id, platform, content) VALUES ('m1', 'c1', 'n1', 's1', 'telegram', 'hello')",
      ).run();
      db.prepare(
        "INSERT INTO agent_memory (id, node_id, fact) VALUES ('f1', 'n1', 'remembers X')",
      ).run();

      const stats = getStats(db, 3);
      expect(stats.entities).toBe(2);
      expect(stats.relations).toBe(1);
      expect(stats.events).toBe(1);
      expect(stats.observations).toBe(1);
      expect(stats.conversations).toBe(1);
      expect(stats.messages).toBe(1);
      expect(stats.facts).toBe(1);
      expect(stats.extractionFailures).toBe(3);
    });

    it('uses default extractionFailures of 0', () => {
      const stats = getStats(db);
      expect(stats.extractionFailures).toBe(0);
    });
  });
});
