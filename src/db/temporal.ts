import type BetterSqlite3 from 'better-sqlite3';
import { isEventRow, toEntity, toEvent } from './types.js';
import type { Entity, Event } from './types.js';

export interface DecayingRelationship {
  entity: Entity;
  daysSinceContact: number;
  averageGapDays: number;
}

interface DecayRow {
  id: string;
  type: string;
  name: string;
  summary: string | null;
  properties: string | null;
  importance_score: number;
  first_seen_at: string;
  last_updated_at: string;
  last_mentioned_at: string | null;
  mention_count: number;
  days_since_contact: number;
  avg_gap_days: number;
}

function isDecayRow(value: unknown): value is DecayRow {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const row = value as Record<string, unknown>;
  return (
    typeof row['id'] === 'string' &&
    typeof row['name'] === 'string' &&
    typeof row['days_since_contact'] === 'number' &&
    typeof row['avg_gap_days'] === 'number'
  );
}

export function getUpcomingDeadlines(db: BetterSqlite3.Database, hours: number): Event[] {
  const rows: unknown[] = db
    .prepare(
      `
    SELECT * FROM events
    WHERE timestamp > datetime('now')
      AND timestamp <= datetime('now', ? || ' hours')
    ORDER BY timestamp ASC
  `,
    )
    .all(String(hours));

  return rows.filter(isEventRow).map(toEvent);
}

export function getRecentActivity(
  db: BetterSqlite3.Database,
  entityId: string,
  days: number,
): Event[] {
  const rows: unknown[] = db
    .prepare(
      `
    SELECT e.* FROM events e, json_each(e.entity_ids) j
    WHERE j.value = ?
      AND e.timestamp >= datetime('now', ? || ' days')
    ORDER BY e.timestamp DESC
  `,
    )
    .all(entityId, String(-days));

  return rows.filter(isEventRow).map(toEvent);
}

export function getDecayingRelationships(
  db: BetterSqlite3.Database,
  thresholdDays: number,
): DecayingRelationship[] {
  const rows: unknown[] = db
    .prepare(
      `
    SELECT
      ent.*,
      CAST(julianday('now') - julianday(ent.last_mentioned_at) AS REAL) AS days_since_contact,
      CASE
        WHEN ent.mention_count > 1 THEN
          CAST(
            julianday(ent.last_mentioned_at) - julianday(ent.first_seen_at)
          AS REAL) / (ent.mention_count - 1)
        ELSE 0.0
      END AS avg_gap_days
    FROM entities ent
    WHERE ent.type = 'person'
      AND ent.last_mentioned_at IS NOT NULL
      AND julianday('now') - julianday(ent.last_mentioned_at) > ?
    ORDER BY days_since_contact DESC
  `,
    )
    .all(thresholdDays);

  return rows.filter(isDecayRow).map((row) => ({
    entity: toEntity(row),
    daysSinceContact: Math.round(row.days_since_contact),
    averageGapDays: Math.round(row.avg_gap_days * 10) / 10,
  }));
}
