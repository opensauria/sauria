import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb } from '../../__tests__/helpers/db.js';
import { deleteRow, deleteConversation, updateEntity } from '../brain-queries-mutations.js';

function seedEntity(db: Database.Database, id = 'e1'): void {
  db.prepare(
    `INSERT INTO entities (id, type, name, summary) VALUES (?, 'person', 'Alice', 'Engineer')`,
  ).run(id);
}

describe('brain-queries-mutations', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    db.close();
  });

  describe('deleteRow', () => {
    it('deletes an entity by id', () => {
      seedEntity(db);
      expect(deleteRow(db, 'entities', 'e1')).toBe(true);
      const row = db.prepare('SELECT * FROM entities WHERE id = ?').get('e1');
      expect(row).toBeUndefined();
    });

    it('deletes a relation by id', () => {
      seedEntity(db, 'e1');
      seedEntity(db, 'e2');
      db.prepare(
        "INSERT INTO relations (id, from_entity_id, to_entity_id, type) VALUES ('r1', 'e1', 'e2', 'knows')",
      ).run();
      expect(deleteRow(db, 'relations', 'r1')).toBe(true);
    });

    it('deletes an observation by id', () => {
      db.prepare(
        "INSERT INTO observations (id, type, content) VALUES ('o1', 'fact', 'some fact')",
      ).run();
      expect(deleteRow(db, 'observations', 'o1')).toBe(true);
    });

    it('deletes an event by id', () => {
      db.prepare(
        "INSERT INTO events (id, source, event_type, timestamp) VALUES ('ev1', 'test', 'meeting', '2026-01-01')",
      ).run();
      expect(deleteRow(db, 'events', 'ev1')).toBe(true);
    });

    it('deletes from agent_memory by id', () => {
      db.prepare(
        "INSERT INTO agent_memory (id, node_id, fact) VALUES ('f1', 'n1', 'likes tea')",
      ).run();
      expect(deleteRow(db, 'agent_memory', 'f1')).toBe(true);
    });

    it('returns false for disallowed table', () => {
      expect(deleteRow(db, 'agent_conversations', 'c1')).toBe(false);
    });

    it('returns false for unknown table', () => {
      expect(deleteRow(db, 'nonexistent_table', 'x')).toBe(false);
    });

    it('returns false when id does not exist', () => {
      expect(deleteRow(db, 'entities', 'nonexistent')).toBe(false);
    });
  });

  describe('deleteConversation', () => {
    it('deletes conversation and its messages', () => {
      db.prepare(
        "INSERT INTO agent_conversations (id, platform) VALUES ('c1', 'telegram')",
      ).run();
      db.prepare(
        "INSERT INTO agent_messages (id, conversation_id, source_node_id, sender_id, platform, content) VALUES ('m1', 'c1', 'n1', 's1', 'telegram', 'hello')",
      ).run();
      db.prepare(
        "INSERT INTO agent_messages (id, conversation_id, source_node_id, sender_id, platform, content) VALUES ('m2', 'c1', 'n1', 's1', 'telegram', 'world')",
      ).run();

      expect(deleteConversation(db, 'c1')).toBe(true);

      const conv = db.prepare('SELECT * FROM agent_conversations WHERE id = ?').get('c1');
      expect(conv).toBeUndefined();
      const msgs = db.prepare('SELECT * FROM agent_messages WHERE conversation_id = ?').all('c1');
      expect(msgs).toHaveLength(0);
    });

    it('returns false for nonexistent conversation', () => {
      expect(deleteConversation(db, 'nonexistent')).toBe(false);
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

    it('updates summary', () => {
      seedEntity(db);
      expect(updateEntity(db, 'e1', { summary: 'New summary' })).toBe(true);
      const row = db.prepare('SELECT summary FROM entities WHERE id = ?').get('e1') as {
        summary: string;
      };
      expect(row.summary).toBe('New summary');
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

    it('updates multiple fields at once', () => {
      seedEntity(db);
      expect(updateEntity(db, 'e1', { name: 'Carol', summary: 'Manager' })).toBe(true);
      const row = db.prepare('SELECT name, summary FROM entities WHERE id = ?').get('e1') as {
        name: string;
        summary: string;
      };
      expect(row.name).toBe('Carol');
      expect(row.summary).toBe('Manager');
    });

    it('updates last_updated_at timestamp', () => {
      seedEntity(db);
      const before = db.prepare('SELECT last_updated_at FROM entities WHERE id = ?').get('e1') as {
        last_updated_at: string;
      };
      updateEntity(db, 'e1', { name: 'Updated' });
      const after = db.prepare('SELECT last_updated_at FROM entities WHERE id = ?').get('e1') as {
        last_updated_at: string;
      };
      expect(after.last_updated_at).toBeDefined();
    });

    it('returns false when no fields provided', () => {
      seedEntity(db);
      expect(updateEntity(db, 'e1', {})).toBe(false);
    });

    it('returns false for nonexistent entity', () => {
      expect(updateEntity(db, 'nonexistent', { name: 'X' })).toBe(false);
    });
  });
});
