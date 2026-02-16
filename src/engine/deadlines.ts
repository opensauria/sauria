import type BetterSqlite3 from 'better-sqlite3';
import { getUpcomingDeadlines } from '../db/temporal.js';
import type { Event } from '../db/types.js';

export interface DeadlineAlert {
  readonly type: 'deadline_approaching' | 'deadline_overdue' | 'conflict';
  readonly priority: 'critical' | 'high' | 'medium' | 'low';
  readonly numericPriority: number;
  readonly title: string;
  readonly details: string;
  readonly relatedEntityIds: readonly string[];
  readonly scheduledFor: string;
  readonly hoursUntil: number;
}

interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  entity_ids: string | null;
  scheduled_for: string | null;
  completed_at: string | null;
  created_at: string;
}

function isTaskRow(value: unknown): value is TaskRow {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const row = value as Record<string, unknown>;
  return typeof row['id'] === 'string' && typeof row['title'] === 'string';
}

function classifyPriority(hoursUntil: number): DeadlineAlert['priority'] {
  if (hoursUntil < 4) return 'critical';
  if (hoursUntil < 24) return 'high';
  if (hoursUntil < 72) return 'medium';
  return 'low';
}

const PRIORITY_ORDER: Readonly<Record<string, number>> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

function numericPriority(priority: DeadlineAlert['priority']): number {
  return PRIORITY_ORDER[priority] ?? 0;
}

function parseEntityIds(raw: string | null): string[] {
  if (!raw) return [];
  return JSON.parse(raw) as string[];
}

export function scanDeadlines(db: BetterSqlite3.Database): DeadlineAlert[] {
  const alerts: DeadlineAlert[] = [];
  const now = Date.now();

  const taskRows: unknown[] = db
    .prepare(
      "SELECT * FROM tasks WHERE status NOT IN ('completed','cancelled') AND scheduled_for IS NOT NULL ORDER BY scheduled_for ASC",
    )
    .all();

  for (const raw of taskRows) {
    if (!isTaskRow(raw)) continue;
    if (!raw.scheduled_for) continue;

    const scheduled = new Date(raw.scheduled_for).getTime();
    const hoursUntil = (scheduled - now) / 3_600_000;
    const entityIds = parseEntityIds(raw.entity_ids);

    if (hoursUntil < 0) {
      alerts.push({
        type: 'deadline_overdue',
        priority: 'critical',
        numericPriority: 5,
        title: `Overdue: ${raw.title}`,
        details: `Task was due ${Math.round(Math.abs(hoursUntil))}h ago`,
        relatedEntityIds: entityIds,
        scheduledFor: raw.scheduled_for,
        hoursUntil,
      });
      continue;
    }

    if (hoursUntil <= 72) {
      const priority = classifyPriority(hoursUntil);
      alerts.push({
        type: 'deadline_approaching',
        priority,
        numericPriority: numericPriority(priority),
        title: `Due soon: ${raw.title}`,
        details: `Due in ${Math.round(hoursUntil)}h`,
        relatedEntityIds: entityIds,
        scheduledFor: raw.scheduled_for,
        hoursUntil,
      });
    }
  }

  const upcomingEvents = getUpcomingDeadlines(db, 72);
  alerts.push(...findConflicts(upcomingEvents));

  return alerts.sort(
    (a, b) => b.numericPriority - a.numericPriority || a.hoursUntil - b.hoursUntil,
  );
}

function findConflicts(events: Event[]): DeadlineAlert[] {
  const alerts: DeadlineAlert[] = [];

  for (let i = 0; i < events.length; i++) {
    const current = events[i];
    if (!current) continue;
    const currentTime = new Date(current.timestamp).getTime();
    const currentEntityIds = current.entityIds ?? [];

    for (let j = i + 1; j < events.length; j++) {
      const next = events[j];
      if (!next) continue;
      const nextTime = new Date(next.timestamp).getTime();
      const gapMs = Math.abs(nextTime - currentTime);

      if (gapMs > 3_600_000) continue;

      const nextEntityIds = next.entityIds ?? [];
      const hasSharedEntity = currentEntityIds.some((id) => nextEntityIds.includes(id));
      if (!hasSharedEntity && currentEntityIds.length > 0 && nextEntityIds.length > 0) continue;

      const gapMinutes = Math.round(gapMs / 60_000);
      const mergedIds = [...new Set([...currentEntityIds, ...nextEntityIds])];

      alerts.push({
        type: 'conflict',
        priority: 'high',
        numericPriority: 3,
        title: 'Schedule conflict detected',
        details: `Events "${current.eventType}" and "${next.eventType}" overlap within ${gapMinutes} minutes`,
        relatedEntityIds: mergedIds,
        scheduledFor: current.timestamp,
        hoursUntil: (currentTime - Date.now()) / 3_600_000,
      });
    }
  }

  return alerts;
}
