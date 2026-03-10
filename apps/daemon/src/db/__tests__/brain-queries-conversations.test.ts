import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb } from '../../__tests__/helpers/db.js';
import {
  listEvents,
  listConversations,
  getConversationMessages,
  listFacts,
} from '../brain-queries-conversations.js';

function seedEvents(db: Database.Database): void {
  db.prepare(
    "INSERT INTO events (id, source, event_type, timestamp) VALUES ('ev1', 'email', 'meeting', '2026-01-01T10:00:00')",
  ).run();
  db.prepare(
    "INSERT INTO events (id, source, event_type, timestamp) VALUES ('ev2', 'telegram', 'message', '2026-01-02T10:00:00')",
  ).run();
  db.prepare(
    "INSERT INTO events (id, source, event_type, timestamp) VALUES ('ev3', 'email', 'follow-up', '2026-01-03T10:00:00')",
  ).run();
}

function seedConversations(db: Database.Database): void {
  db.prepare(
    `INSERT INTO agent_conversations (id, platform, participant_node_ids, last_message_at, message_count)
     VALUES ('c1', 'telegram', '["n1","n2"]', '2026-01-02T10:00:00', 2)`,
  ).run();
  db.prepare(
    `INSERT INTO agent_conversations (id, platform, participant_node_ids, last_message_at, message_count)
     VALUES ('c2', 'discord', '["n3"]', '2026-01-01T10:00:00', 1)`,
  ).run();
  db.prepare(
    "INSERT INTO agent_messages (id, conversation_id, source_node_id, sender_id, platform, content, created_at) VALUES ('m1', 'c1', 'n1', 's1', 'telegram', 'hello world', '2026-01-02T09:00:00')",
  ).run();
  db.prepare(
    "INSERT INTO agent_messages (id, conversation_id, source_node_id, sender_id, platform, content, created_at) VALUES ('m2', 'c1', 'n2', 's2', 'telegram', 'goodbye', '2026-01-02T10:00:00')",
  ).run();
  db.prepare(
    "INSERT INTO agent_messages (id, conversation_id, source_node_id, sender_id, platform, content, created_at) VALUES ('m3', 'c2', 'n3', 's3', 'discord', 'ping', '2026-01-01T10:00:00')",
  ).run();
}

function seedFacts(db: Database.Database): void {
  db.prepare(
    "INSERT INTO agent_memory (id, node_id, workspace_id, fact, created_at) VALUES ('f1', 'n1', 'w1', 'likes coffee', '2026-01-01')",
  ).run();
  db.prepare(
    "INSERT INTO agent_memory (id, node_id, workspace_id, fact, created_at) VALUES ('f2', 'n1', 'w2', 'prefers mornings', '2026-01-02')",
  ).run();
  db.prepare(
    "INSERT INTO agent_memory (id, node_id, workspace_id, fact, created_at) VALUES ('f3', 'n2', 'w1', 'hates spam', '2026-01-03')",
  ).run();
}

describe('brain-queries-conversations', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    db.close();
  });

  describe('listEvents', () => {
    it('returns empty result for empty table', () => {
      const result = listEvents(db);
      expect(result.rows).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('returns all events without filters', () => {
      seedEvents(db);
      const result = listEvents(db);
      expect(result.total).toBe(3);
      expect(result.rows).toHaveLength(3);
    });

    it('filters by source', () => {
      seedEvents(db);
      const result = listEvents(db, { source: 'email' });
      expect(result.total).toBe(2);
      expect(result.rows).toHaveLength(2);
    });

    it('filters by search term across source and event_type', () => {
      seedEvents(db);
      const result = listEvents(db, { search: 'meeting' });
      expect(result.total).toBe(1);
      expect(result.rows).toHaveLength(1);
    });

    it('combines source and search filters', () => {
      seedEvents(db);
      const result = listEvents(db, { source: 'email', search: 'follow' });
      expect(result.total).toBe(1);
    });

    it('respects limit and offset', () => {
      seedEvents(db);
      const result = listEvents(db, { limit: 1, offset: 1 });
      expect(result.total).toBe(3);
      expect(result.rows).toHaveLength(1);
    });

    it('orders by timestamp DESC', () => {
      seedEvents(db);
      const result = listEvents(db);
      const timestamps = result.rows.map((r) => r['timestamp'] as string);
      expect(timestamps[0]! > timestamps[1]!).toBe(true);
      expect(timestamps[1]! > timestamps[2]!).toBe(true);
    });
  });

  describe('listConversations', () => {
    it('returns empty result for empty table', () => {
      const result = listConversations(db);
      expect(result.rows).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('returns all conversations without filters', () => {
      seedConversations(db);
      const result = listConversations(db);
      expect(result.total).toBe(2);
      expect(result.rows).toHaveLength(2);
    });

    it('filters by platform', () => {
      seedConversations(db);
      const result = listConversations(db, { platform: 'telegram' });
      expect(result.total).toBe(1);
      expect((result.rows[0] as Record<string, unknown>)['platform']).toBe('telegram');
    });

    it('filters by nodeIds using JSON_EACH', () => {
      seedConversations(db);
      const result = listConversations(db, { nodeIds: ['n1'] });
      expect(result.total).toBe(1);
      expect((result.rows[0] as Record<string, unknown>)['id']).toBe('c1');
    });

    it('filters by multiple nodeIds (AND logic)', () => {
      seedConversations(db);
      const result = listConversations(db, { nodeIds: ['n1', 'n2'] });
      expect(result.total).toBe(1);
    });

    it('returns empty when nodeIds do not match', () => {
      seedConversations(db);
      const result = listConversations(db, { nodeIds: ['nonexistent'] });
      expect(result.total).toBe(0);
    });

    it('filters by search term in message content', () => {
      seedConversations(db);
      const result = listConversations(db, { search: 'hello' });
      expect(result.total).toBe(1);
      expect((result.rows[0] as Record<string, unknown>)['id']).toBe('c1');
    });

    it('combines search with platform filter', () => {
      seedConversations(db);
      const result = listConversations(db, { search: 'hello', platform: 'telegram' });
      expect(result.total).toBe(1);
    });

    it('search with non-matching platform returns empty', () => {
      seedConversations(db);
      const result = listConversations(db, { search: 'hello', platform: 'discord' });
      expect(result.total).toBe(0);
    });

    it('combines search with nodeIds filter', () => {
      seedConversations(db);
      const result = listConversations(db, { search: 'hello', nodeIds: ['n1'] });
      expect(result.total).toBe(1);
    });

    it('respects limit and offset', () => {
      seedConversations(db);
      const result = listConversations(db, { limit: 1, offset: 0 });
      expect(result.total).toBe(2);
      expect(result.rows).toHaveLength(1);
    });
  });

  describe('getConversationMessages', () => {
    it('returns empty for nonexistent conversation', () => {
      const result = getConversationMessages(db, 'nonexistent');
      expect(result.rows).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('returns messages for a conversation ordered by created_at ASC', () => {
      seedConversations(db);
      const result = getConversationMessages(db, 'c1');
      expect(result.total).toBe(2);
      expect(result.rows).toHaveLength(2);
      const first = result.rows[0] as Record<string, unknown>;
      const second = result.rows[1] as Record<string, unknown>;
      expect((first['created_at'] as string) < (second['created_at'] as string)).toBe(true);
    });

    it('respects limit and offset', () => {
      seedConversations(db);
      const result = getConversationMessages(db, 'c1', { limit: 1, offset: 1 });
      expect(result.total).toBe(2);
      expect(result.rows).toHaveLength(1);
      expect((result.rows[0] as Record<string, unknown>)['id']).toBe('m2');
    });
  });

  describe('listFacts', () => {
    it('returns empty for empty table', () => {
      const result = listFacts(db);
      expect(result.rows).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('returns all facts without filters', () => {
      seedFacts(db);
      const result = listFacts(db);
      expect(result.total).toBe(3);
      expect(result.rows).toHaveLength(3);
    });

    it('filters by nodeId', () => {
      seedFacts(db);
      const result = listFacts(db, { nodeId: 'n1' });
      expect(result.total).toBe(2);
    });

    it('filters by workspaceId', () => {
      seedFacts(db);
      const result = listFacts(db, { workspaceId: 'w1' });
      expect(result.total).toBe(2);
    });

    it('filters by search term in fact text', () => {
      seedFacts(db);
      const result = listFacts(db, { search: 'coffee' });
      expect(result.total).toBe(1);
    });

    it('combines nodeId and workspaceId filters', () => {
      seedFacts(db);
      const result = listFacts(db, { nodeId: 'n1', workspaceId: 'w1' });
      expect(result.total).toBe(1);
    });

    it('respects limit and offset', () => {
      seedFacts(db);
      const result = listFacts(db, { limit: 1, offset: 0 });
      expect(result.total).toBe(3);
      expect(result.rows).toHaveLength(1);
    });
  });
});
