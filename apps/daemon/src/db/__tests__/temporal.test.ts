import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb } from '../../__tests__/helpers/db.js';
import { getUpcomingDeadlines, getRecentActivity, getDecayingRelationships } from '../temporal.js';
import { upsertEntity, recordEvent } from '../world-model.js';

/** SQLite datetime('now') returns UTC without the 'Z' suffix, so we must
 *  produce timestamps in the same format for comparison to work. */
function sqliteNowPlusHours(db: Database.Database, hours: number): string {
  const row = db.prepare(`SELECT datetime('now', ? || ' hours') AS ts`).get(String(hours)) as {
    ts: string;
  };
  return row.ts;
}

function sqliteNowMinusDays(db: Database.Database, days: number): string {
  const row = db.prepare(`SELECT datetime('now', ? || ' days') AS ts`).get(String(-days)) as {
    ts: string;
  };
  return row.ts;
}

describe('temporal', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    db.close();
  });

  describe('getUpcomingDeadlines', () => {
    it('returns events within the specified hour window', () => {
      recordEvent(db, {
        id: 'ev1',
        source: 'calendar',
        eventType: 'deadline',
        contentHash: 'h1',
        timestamp: sqliteNowPlusHours(db, 2),
      });
      recordEvent(db, {
        id: 'ev2',
        source: 'calendar',
        eventType: 'deadline',
        contentHash: 'h2',
        timestamp: sqliteNowPlusHours(db, 10),
      });

      const results = getUpcomingDeadlines(db, 5);
      expect(results).toHaveLength(1);
      expect(results[0]?.id).toBe('ev1');
    });

    it('returns empty array when no upcoming events', () => {
      recordEvent(db, {
        id: 'ev1',
        source: 'calendar',
        eventType: 'meeting',
        contentHash: 'h1',
        timestamp: sqliteNowMinusDays(db, 1),
      });

      const results = getUpcomingDeadlines(db, 24);
      expect(results).toEqual([]);
    });

    it('orders results by timestamp ascending', () => {
      recordEvent(db, {
        id: 'ev1',
        source: 'calendar',
        eventType: 'deadline',
        contentHash: 'h1',
        timestamp: sqliteNowPlusHours(db, 4),
      });
      recordEvent(db, {
        id: 'ev2',
        source: 'calendar',
        eventType: 'deadline',
        contentHash: 'h2',
        timestamp: sqliteNowPlusHours(db, 1),
      });

      const results = getUpcomingDeadlines(db, 5);
      expect(results).toHaveLength(2);
      expect(results[0]?.id).toBe('ev2');
      expect(results[1]?.id).toBe('ev1');
    });
  });

  describe('getRecentActivity', () => {
    it('returns events for an entity within the day window', () => {
      upsertEntity(db, { id: 'e1', type: 'person', name: 'Alice' });

      recordEvent(db, {
        id: 'ev1',
        source: 'telegram',
        eventType: 'message',
        contentHash: 'h1',
        entityIds: ['e1'],
        timestamp: sqliteNowMinusDays(db, 2),
      });
      recordEvent(db, {
        id: 'ev2',
        source: 'telegram',
        eventType: 'message',
        contentHash: 'h2',
        entityIds: ['e1'],
        timestamp: sqliteNowMinusDays(db, 10),
      });

      const results = getRecentActivity(db, 'e1', 5);
      expect(results).toHaveLength(1);
      expect(results[0]?.id).toBe('ev1');
    });

    it('returns empty array when entity has no recent events', () => {
      upsertEntity(db, { id: 'e1', type: 'person', name: 'Alice' });
      const results = getRecentActivity(db, 'e1', 7);
      expect(results).toEqual([]);
    });

    it('only returns events linked to the specified entity', () => {
      upsertEntity(db, { id: 'e1', type: 'person', name: 'Alice' });
      upsertEntity(db, { id: 'e2', type: 'person', name: 'Bob' });

      recordEvent(db, {
        id: 'ev1',
        source: 'telegram',
        eventType: 'message',
        contentHash: 'h1',
        entityIds: ['e1'],
        timestamp: sqliteNowMinusDays(db, 1),
      });
      recordEvent(db, {
        id: 'ev2',
        source: 'telegram',
        eventType: 'message',
        contentHash: 'h2',
        entityIds: ['e2'],
        timestamp: sqliteNowMinusDays(db, 1),
      });

      const results = getRecentActivity(db, 'e1', 7);
      expect(results).toHaveLength(1);
      expect(results[0]?.id).toBe('ev1');
    });
  });

  describe('getDecayingRelationships', () => {
    it('returns person entities not mentioned beyond threshold', () => {
      const oldDate = sqliteNowMinusDays(db, 60);
      db.prepare(
        `INSERT INTO entities (id, type, name, importance_score, first_seen_at, last_updated_at, last_mentioned_at, mention_count)
         VALUES ('e1', 'person', 'Alice', 0.5, ?, ?, ?, 3)`,
      ).run(oldDate, oldDate, oldDate);

      const results = getDecayingRelationships(db, 30);
      expect(results).toHaveLength(1);
      expect(results[0]?.entity.name).toBe('Alice');
      expect(results[0]?.daysSinceContact).toBeGreaterThanOrEqual(59);
    });

    it('excludes non-person entities', () => {
      const oldDate = sqliteNowMinusDays(db, 60);
      db.prepare(
        `INSERT INTO entities (id, type, name, importance_score, first_seen_at, last_updated_at, last_mentioned_at, mention_count)
         VALUES ('e1', 'company', 'Acme', 0.5, ?, ?, ?, 2)`,
      ).run(oldDate, oldDate, oldDate);

      const results = getDecayingRelationships(db, 30);
      expect(results).toEqual([]);
    });

    it('excludes entities within the threshold', () => {
      const recentDate = sqliteNowMinusDays(db, 5);
      db.prepare(
        `INSERT INTO entities (id, type, name, importance_score, first_seen_at, last_updated_at, last_mentioned_at, mention_count)
         VALUES ('e1', 'person', 'Alice', 0.5, ?, ?, ?, 2)`,
      ).run(recentDate, recentDate, recentDate);

      const results = getDecayingRelationships(db, 30);
      expect(results).toEqual([]);
    });

    it('computes averageGapDays from mention history', () => {
      const firstSeen = sqliteNowMinusDays(db, 90);
      const lastMentioned = sqliteNowMinusDays(db, 45);
      db.prepare(
        `INSERT INTO entities (id, type, name, importance_score, first_seen_at, last_updated_at, last_mentioned_at, mention_count)
         VALUES ('e1', 'person', 'Bob', 0.5, ?, ?, ?, 10)`,
      ).run(firstSeen, lastMentioned, lastMentioned);

      const results = getDecayingRelationships(db, 30);
      expect(results).toHaveLength(1);
      expect(results[0]?.averageGapDays).toBeGreaterThan(0);
    });
  });
});
