import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { detectPatterns } from '../patterns.js';
import { applySchema } from '../../db/schema.js';

function createTestDb(): InstanceType<typeof Database> {
  const db = new Database(':memory:');
  applySchema(db);
  return db;
}

/** Format Date as SQLite-compatible `YYYY-MM-DD HH:MM:SS`. */
function sqlDate(d: Date): string {
  return d
    .toISOString()
    .replace('T', ' ')
    .replace(/\.\d{3}Z$/, '');
}

function insertEvent(
  db: InstanceType<typeof Database>,
  overrides: Partial<{
    id: string;
    source: string;
    event_type: string;
    timestamp: string;
  }> = {},
): void {
  const defaults = {
    id: `evt-${Math.random().toString(36).slice(2, 8)}`,
    source: 'email',
    event_type: 'message',
    timestamp: sqlDate(new Date()),
  };
  const evt = { ...defaults, ...overrides };
  db.prepare('INSERT INTO events (id, source, event_type, timestamp) VALUES (?, ?, ?, ?)').run(
    evt.id,
    evt.source,
    evt.event_type,
    evt.timestamp,
  );
}

function insertEntity(
  db: InstanceType<typeof Database>,
  overrides: Partial<{
    id: string;
    name: string;
    type: string;
    first_seen_at: string;
    mention_count: number;
  }> = {},
): void {
  const defaults = {
    id: `ent-${Math.random().toString(36).slice(2, 8)}`,
    name: 'Test Entity',
    type: 'person',
    first_seen_at: sqlDate(new Date()),
    mention_count: 1,
  };
  const ent = { ...defaults, ...overrides };
  db.prepare(
    'INSERT INTO entities (id, name, type, first_seen_at, last_updated_at, mention_count) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(ent.id, ent.name, ent.type, ent.first_seen_at, ent.first_seen_at, ent.mention_count);
}

describe('detectPatterns', () => {
  const NOW = new Date('2026-03-10T12:00:00.000Z');
  let db: InstanceType<typeof Database>;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    db.close();
  });

  it('returns empty array when no events or entities exist', () => {
    const alerts = detectPatterns(db, NOW);
    expect(alerts).toEqual([]);
  });

  it('detects frequency increase when recent count is 2x+ baseline', () => {
    // Baseline: 2 events per week over 4 weeks (8 events in days -37 to -7)
    for (let i = 0; i < 8; i++) {
      const dayOffset = 8 + Math.floor(i * 3.5);
      const ts = sqlDate(new Date(NOW.getTime() - dayOffset * 86_400_000));
      insertEvent(db, { source: 'slack', timestamp: ts });
    }

    // Recent: 6 events in last 7 days (3x the baseline avg of 2)
    for (let i = 0; i < 6; i++) {
      const ts = sqlDate(new Date(NOW.getTime() - i * 86_400_000));
      insertEvent(db, { source: 'slack', timestamp: ts });
    }

    const alerts = detectPatterns(db, NOW);
    const frequencyAlerts = alerts.filter((a) => a.patternKind === 'frequency_change');
    expect(frequencyAlerts.length).toBeGreaterThanOrEqual(1);
    expect(frequencyAlerts[0]?.title).toContain('slack');
    expect(frequencyAlerts[0]?.title).toContain('surged');
  });

  it('detects frequency decrease when recent count is 0.5x or less baseline', () => {
    // Baseline: 20 events per week over 4 weeks (80 events total in days -37 to -7)
    for (let i = 0; i < 80; i++) {
      const dayOffset = 8 + Math.floor(i * 0.375);
      const ts = sqlDate(new Date(NOW.getTime() - dayOffset * 86_400_000));
      insertEvent(db, { source: 'telegram', timestamp: ts });
    }

    // Recent: only 2 events in last 7 days (0.1x baseline avg of 20)
    for (let i = 0; i < 2; i++) {
      const ts = sqlDate(new Date(NOW.getTime() - i * 86_400_000));
      insertEvent(db, { source: 'telegram', timestamp: ts });
    }

    const alerts = detectPatterns(db, NOW);
    const drops = alerts.filter(
      (a) => a.patternKind === 'frequency_change' && a.title.includes('dropped'),
    );
    expect(drops.length).toBeGreaterThanOrEqual(1);
  });

  it('detects new notable entities with 3+ mentions in the last 7 days', () => {
    const recentDate = sqlDate(new Date('2026-03-08T12:00:00.000Z'));
    insertEntity(db, {
      id: 'ent-new',
      name: 'Emerging Person',
      type: 'person',
      first_seen_at: recentDate,
      mention_count: 5,
    });

    const alerts = detectPatterns(db, NOW);
    const newConn = alerts.filter((a) => a.patternKind === 'new_connection');
    expect(newConn).toHaveLength(1);
    expect(newConn[0]?.title).toContain('Emerging Person');
    expect(newConn[0]?.entityIds).toContain('ent-new');
  });

  it('ignores new entities with fewer than 3 mentions', () => {
    const recentDate = sqlDate(new Date('2026-03-08T12:00:00.000Z'));
    insertEntity(db, {
      name: 'Minor Entity',
      first_seen_at: recentDate,
      mention_count: 2,
    });

    const alerts = detectPatterns(db, NOW);
    const newConn = alerts.filter((a) => a.patternKind === 'new_connection');
    expect(newConn).toHaveLength(0);
  });

  it('assigns priority 4 for entities with 10+ mentions', () => {
    const recentDate = sqlDate(new Date('2026-03-08T12:00:00.000Z'));
    insertEntity(db, {
      name: 'Hot Entity',
      first_seen_at: recentDate,
      mention_count: 15,
    });

    const alerts = detectPatterns(db, NOW);
    const hot = alerts.find((a) => a.title.includes('Hot Entity'));
    expect(hot?.priority).toBe(4);
  });

  it('sorts alerts by priority descending', () => {
    const recentDate = sqlDate(new Date('2026-03-08T12:00:00.000Z'));
    insertEntity(db, {
      name: 'Low priority',
      first_seen_at: recentDate,
      mention_count: 3,
    });
    insertEntity(db, {
      name: 'High priority',
      first_seen_at: recentDate,
      mention_count: 12,
    });

    const alerts = detectPatterns(db, NOW);
    if (alerts.length >= 2) {
      expect(alerts[0]?.priority).toBeGreaterThanOrEqual(alerts[1]?.priority ?? 0);
    }
  });
});
