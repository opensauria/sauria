import type BetterSqlite3 from 'better-sqlite3';
import { isEntityRow, toEntity } from '../db/types.js';

export interface PatternAlert {
  readonly type: 'pattern_detected';
  readonly patternKind: 'frequency_change' | 'new_connection';
  readonly priority: number;
  readonly title: string;
  readonly details: string;
  readonly entityIds: readonly string[];
  readonly confidence: number;
}

interface FrequencyRow {
  source: string;
  recent_count: number;
  baseline_avg: number;
}

function isFrequencyRow(value: unknown): value is FrequencyRow {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const row = value as Record<string, unknown>;
  return (
    typeof row['source'] === 'string' &&
    typeof row['recent_count'] === 'number' &&
    typeof row['baseline_avg'] === 'number'
  );
}

const FREQUENCY_SQL = `
  SELECT
    source,
    (SELECT COUNT(*) FROM events e2
     WHERE e2.source = e1.source
       AND e2.timestamp >= datetime('now', '-7 days')) AS recent_count,
    (SELECT COUNT(*) FROM events e3
     WHERE e3.source = e1.source
       AND e3.timestamp >= datetime('now', '-37 days')
       AND e3.timestamp < datetime('now', '-7 days')) / 4.0 AS baseline_avg
  FROM events e1
  GROUP BY source
  HAVING baseline_avg > 0
`;

const NEW_ENTITIES_SQL = `
  SELECT * FROM entities
  WHERE first_seen_at >= datetime('now', '-7 days')
    AND mention_count >= 3
  ORDER BY mention_count DESC
`;

const INCREASE_THRESHOLD = 2.0;
const DECREASE_THRESHOLD = 0.5;

function buildFrequencyAlerts(db: BetterSqlite3.Database): PatternAlert[] {
  const alerts: PatternAlert[] = [];
  const rows: unknown[] = db.prepare(FREQUENCY_SQL).all();

  for (const raw of rows) {
    if (!isFrequencyRow(raw)) continue;
    const { source, recent_count: recent, baseline_avg: baseline } = raw;
    if (baseline <= 0) continue;

    const ratio = recent / baseline;

    if (ratio >= INCREASE_THRESHOLD) {
      const pctChange = Math.round((ratio - 1) * 100);
      alerts.push({
        type: 'pattern_detected',
        patternKind: 'frequency_change',
        priority: pctChange >= 200 ? 4 : 3,
        title: `${source} activity surged ${pctChange}%`,
        details: `Last 7 days: ${recent} events vs 30-day weekly avg: ${baseline.toFixed(1)}`,
        entityIds: [],
        confidence: Math.min(0.9, 0.5 + (ratio - INCREASE_THRESHOLD) * 0.1),
      });
    } else if (ratio <= DECREASE_THRESHOLD) {
      const pctDrop = Math.round((1 - ratio) * 100);
      alerts.push({
        type: 'pattern_detected',
        patternKind: 'frequency_change',
        priority: pctDrop >= 80 ? 4 : 3,
        title: `${source} activity dropped ${pctDrop}%`,
        details: `Last 7 days: ${recent} events vs 30-day weekly avg: ${baseline.toFixed(1)}`,
        entityIds: [],
        confidence: Math.min(0.9, 0.5 + (DECREASE_THRESHOLD - ratio) * 0.2),
      });
    }
  }

  return alerts;
}

function buildNewConnectionAlerts(db: BetterSqlite3.Database): PatternAlert[] {
  const alerts: PatternAlert[] = [];
  const rows: unknown[] = db.prepare(NEW_ENTITIES_SQL).all();

  for (const raw of rows) {
    if (!isEntityRow(raw)) continue;
    const entity = toEntity(raw);

    alerts.push({
      type: 'pattern_detected',
      patternKind: 'new_connection',
      priority: entity.mentionCount >= 10 ? 4 : 3,
      title: `New notable entity: ${entity.name}`,
      details: `First seen ${entity.firstSeenAt}, mentioned ${entity.mentionCount} times in 7 days`,
      entityIds: [entity.id],
      confidence: Math.min(0.95, 0.6 + entity.mentionCount * 0.03),
    });
  }

  return alerts;
}

export function detectPatterns(db: BetterSqlite3.Database): PatternAlert[] {
  const frequencyAlerts = buildFrequencyAlerts(db);
  const newConnectionAlerts = buildNewConnectionAlerts(db);

  return [...frequencyAlerts, ...newConnectionAlerts].sort((a, b) => b.priority - a.priority);
}
