import type BetterSqlite3 from 'better-sqlite3';
import { isEventRow, toEvent } from '../db/types.js';
import type { DeadlineAlert } from './deadlines.js';
import type { RelationDecayAlert } from './relations.js';
import type { PatternAlert } from './patterns.js';

export interface ProactiveAlert {
  readonly type: string;
  readonly priority: number;
  readonly title: string;
  readonly details: string;
  readonly entityIds: readonly string[];
  readonly timestamp: string;
}

export type AlertCallback = (alert: ProactiveAlert) => void;

export function deadlineToAlert(alert: DeadlineAlert): ProactiveAlert {
  return {
    type: alert.type,
    priority: alert.numericPriority,
    title: alert.title,
    details: alert.details,
    entityIds: alert.relatedEntityIds,
    timestamp: new Date().toISOString(),
  };
}

export function decayToAlert(alert: RelationDecayAlert): ProactiveAlert {
  return {
    type: alert.type,
    priority: alert.numericPriority,
    title: alert.title,
    details: alert.details,
    entityIds: [alert.entityId],
    timestamp: new Date().toISOString(),
  };
}

export function patternToAlert(alert: PatternAlert): ProactiveAlert {
  return {
    type: alert.type,
    priority: alert.priority,
    title: alert.title,
    details: alert.details,
    entityIds: alert.entityIds,
    timestamp: new Date().toISOString(),
  };
}

export function buildAlertKey(alert: ProactiveAlert): string {
  const entityPart = alert.entityIds.length > 0 ? alert.entityIds.slice().sort().join(',') : '';
  return `${alert.type}:${alert.title}:${entityPart}`;
}

export function buildInsightContext(db: BetterSqlite3.Database): string {
  const rows: unknown[] = db.prepare(
    "SELECT * FROM events WHERE timestamp >= datetime('now', '-2 days') ORDER BY importance DESC LIMIT 20",
  ).all();
  const events = rows.filter(isEventRow).map(toEvent);

  if (events.length === 0) return '';

  return events
    .map((e) => `[${e.source}] ${e.eventType}: ${JSON.stringify(e.parsedData)}`)
    .join('\n');
}
