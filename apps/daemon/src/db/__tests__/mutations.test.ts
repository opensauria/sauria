import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb } from '../../__tests__/helpers/db.js';
import {
  deleteEntity,
  deleteObservation,
  deleteEvent,
  deleteRelation,
  deleteConversation,
  deleteMessage,
  deleteFact,
  updateEntity,
} from '../mutations.js';

function seedEntity(db: Database.Database, id = 'e1', name = 'Alice'): void {
  db.prepare(
    `INSERT INTO entities (id, type, name, summary) VALUES (?, 'person', ?, 'Engineer')`,
  ).run(id, name);
}

describe('mutations', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    db.close();
  });

  describe('deleteEntity', () => {
    it('deletes an existing entity', () => {
      seedEntity(db);
      expect(deleteEntity(db, 'e1')).toBe(true);
      expect(db.prepare('SELECT * FROM entities WHERE id = ?').get('e1')).toBeUndefined();
    });

    it('returns false for nonexistent entity', () => {
      expect(deleteEntity(db, 'nonexistent')).toBe(false);
    });
  });

  describe('deleteObservation', () => {
    it('deletes an existing observation', () => {
      db.prepare(
        "INSERT INTO observations (id, type, content) VALUES ('o1', 'fact', 'test')",
      ).run();
      expect(deleteObservation(db, 'o1')).toBe(true);
      expect(db.prepare('SELECT * FROM observations WHERE id = ?').get('o1')).toBeUndefined();
    });

    it('returns false for nonexistent observation', () => {
      expect(deleteObservation(db, 'nonexistent')).toBe(false);
    });
  });

  describe('deleteEvent', () => {
    it('deletes an existing event', () => {
      db.prepare(
        "INSERT INTO events (id, source, event_type, timestamp) VALUES ('ev1', 'test', 'meeting', '2026-01-01')",
      ).run();
      expect(deleteEvent(db, 'ev1')).toBe(true);
      expect(db.prepare('SELECT * FROM events WHERE id = ?').get('ev1')).toBeUndefined();
    });

    it('returns false for nonexistent event', () => {
      expect(deleteEvent(db, 'nonexistent')).toBe(false);
    });
  });

  describe('deleteRelation', () => {
    it('deletes an existing relation', () => {
      seedEntity(db, 'e1');
      seedEntity(db, 'e2');
      db.prepare(
        "INSERT INTO relations (id, from_entity_id, to_entity_id, type) VALUES ('r1', 'e1', 'e2', 'knows')",
      ).run();
      expect(deleteRelation(db, 'r1')).toBe(true);
      expect(db.prepare('SELECT * FROM relations WHERE id = ?').get('r1')).toBeUndefined();
    });

    it('returns false for nonexistent relation', () => {
      expect(deleteRelation(db, 'nonexistent')).toBe(false);
    });
  });

  describe('deleteConversation', () => {
    it('deletes conversation and all its messages', () => {
      db.prepare(
        "INSERT INTO agent_conversations (id, platform, message_count) VALUES ('c1', 'telegram', 2)",
      ).run();
      db.prepare(
        "INSERT INTO agent_messages (id, conversation_id, source_node_id, sender_id, platform, content) VALUES ('m1', 'c1', 'n1', 's1', 'telegram', 'hi')",
      ).run();
      db.prepare(
        "INSERT INTO agent_messages (id, conversation_id, source_node_id, sender_id, platform, content) VALUES ('m2', 'c1', 'n1', 's1', 'telegram', 'bye')",
      ).run();

      expect(deleteConversation(db, 'c1')).toBe(true);
      expect(
        db.prepare('SELECT * FROM agent_conversations WHERE id = ?').get('c1'),
      ).toBeUndefined();
      expect(
        db.prepare('SELECT * FROM agent_messages WHERE conversation_id = ?').all('c1'),
      ).toHaveLength(0);
    });

    it('returns false for nonexistent conversation', () => {
      expect(deleteConversation(db, 'nonexistent')).toBe(false);
    });
  });

  describe('deleteMessage', () => {
    it('deletes a message and decrements conversation message_count', () => {
      db.prepare(
        "INSERT INTO agent_conversations (id, platform, message_count) VALUES ('c1', 'telegram', 2)",
      ).run();
      db.prepare(
        "INSERT INTO agent_messages (id, conversation_id, source_node_id, sender_id, platform, content) VALUES ('m1', 'c1', 'n1', 's1', 'telegram', 'hello')",
      ).run();

      expect(deleteMessage(db, 'm1')).toBe(true);
      expect(db.prepare('SELECT * FROM agent_messages WHERE id = ?').get('m1')).toBeUndefined();

      const conv = db.prepare('SELECT message_count FROM agent_conversations WHERE id = ?').get(
        'c1',
      ) as { message_count: number };
      expect(conv.message_count).toBe(1);
    });

    it('returns false for nonexistent message', () => {
      expect(deleteMessage(db, 'nonexistent')).toBe(false);
    });

    it('does not decrement if message does not exist', () => {
      db.prepare(
        "INSERT INTO agent_conversations (id, platform, message_count) VALUES ('c1', 'telegram', 5)",
      ).run();
      deleteMessage(db, 'nonexistent');
      const conv = db.prepare('SELECT message_count FROM agent_conversations WHERE id = ?').get(
        'c1',
      ) as { message_count: number };
      expect(conv.message_count).toBe(5);
    });
  });

  describe('deleteFact', () => {
    it('deletes an existing fact', () => {
      db.prepare(
        "INSERT INTO agent_memory (id, node_id, fact) VALUES ('f1', 'n1', 'likes coffee')",
      ).run();
      expect(deleteFact(db, 'f1')).toBe(true);
      expect(db.prepare('SELECT * FROM agent_memory WHERE id = ?').get('f1')).toBeUndefined();
    });

    it('returns false for nonexistent fact', () => {
      expect(deleteFact(db, 'nonexistent')).toBe(false);
    });
  });

  describe('updateEntity', () => {
    it('updates name', () => {
      seedEntity(db);
      expect(updateEntity(db, 'e1', { name: 'Bob' })).toBe(true);
      const row = db.prepare('SELECT name FROM entities WHERE id = ?').get('e1') as {
        name: string;
      };
      expect(row.name).toBe('Bob');
    });

    it('updates summary to a value', () => {
      seedEntity(db);
      expect(updateEntity(db, 'e1', { summary: 'New bio' })).toBe(true);
      const row = db.prepare('SELECT summary FROM entities WHERE id = ?').get('e1') as {
        summary: string;
      };
      expect(row.summary).toBe('New bio');
    });

    it('updates summary to null', () => {
      seedEntity(db);
      expect(updateEntity(db, 'e1', { summary: null })).toBe(true);
      const row = db.prepare('SELECT summary FROM entities WHERE id = ?').get('e1') as {
        summary: string | null;
      };
      expect(row.summary).toBeNull();
    });

    it('updates type', () => {
      seedEntity(db);
      expect(updateEntity(db, 'e1', { type: 'company' })).toBe(true);
      const row = db.prepare('SELECT type FROM entities WHERE id = ?').get('e1') as {
        type: string;
      };
      expect(row.type).toBe('company');
    });

    it('updates multiple fields simultaneously', () => {
      seedEntity(db);
      expect(updateEntity(db, 'e1', { name: 'Carol', type: 'company', summary: 'CEO' })).toBe(
        true,
      );
      const row = db.prepare('SELECT name, type, summary FROM entities WHERE id = ?').get(
        'e1',
      ) as { name: string; type: string; summary: string };
      expect(row.name).toBe('Carol');
      expect(row.type).toBe('company');
      expect(row.summary).toBe('CEO');
    });

    it('returns false when no fields provided', () => {
      seedEntity(db);
      expect(updateEntity(db, 'e1', {})).toBe(false);
    });

    it('returns false for nonexistent entity', () => {
      expect(updateEntity(db, 'nonexistent', { name: 'X' })).toBe(false);
    });

    it('sets last_updated_at on update', () => {
      seedEntity(db);
      updateEntity(db, 'e1', { name: 'Updated' });
      const row = db.prepare('SELECT last_updated_at FROM entities WHERE id = ?').get('e1') as {
        last_updated_at: string;
      };
      expect(row.last_updated_at).toBeDefined();
    });
  });
});
