import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { applySchema } from '../../db/schema.js';
import {
  deadlineToAlert,
  decayToAlert,
  patternToAlert,
  buildAlertKey,
  buildInsightContext,
} from '../alert-converters.js';
import type { ProactiveAlert } from '../alert-converters.js';
import type { DeadlineAlert } from '../deadlines.js';
import type { RelationDecayAlert } from '../relations.js';
import type { PatternAlert } from '../patterns.js';

describe('deadlineToAlert', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-10T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('converts DeadlineAlert to ProactiveAlert with correct fields', () => {
    const deadline: DeadlineAlert = {
      type: 'deadline_approaching',
      priority: 'high',
      numericPriority: 3,
      title: 'Due soon: Report',
      details: 'Due in 8h',
      relatedEntityIds: ['ent-1', 'ent-2'],
      scheduledFor: '2026-03-10T20:00:00.000Z',
      hoursUntil: 8,
    };

    const result = deadlineToAlert(deadline);

    expect(result.type).toBe('deadline_approaching');
    expect(result.priority).toBe(3);
    expect(result.title).toBe('Due soon: Report');
    expect(result.details).toBe('Due in 8h');
    expect(result.entityIds).toEqual(['ent-1', 'ent-2']);
    expect(result.timestamp).toBe('2026-03-10T12:00:00.000Z');
  });

  it('maps overdue deadline numericPriority correctly', () => {
    const overdue: DeadlineAlert = {
      type: 'deadline_overdue',
      priority: 'critical',
      numericPriority: 5,
      title: 'Overdue: Deploy',
      details: 'Task was due 2h ago',
      relatedEntityIds: [],
      scheduledFor: '2026-03-10T10:00:00.000Z',
      hoursUntil: -2,
    };

    const result = deadlineToAlert(overdue);
    expect(result.priority).toBe(5);
    expect(result.entityIds).toEqual([]);
  });
});

describe('decayToAlert', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-10T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('converts RelationDecayAlert to ProactiveAlert', () => {
    const decay: RelationDecayAlert = {
      type: 'relationship_decay',
      priority: 'medium',
      numericPriority: 2,
      title: 'Losing touch: Alice',
      details: 'No contact in 30 days',
      entityId: 'ent-alice',
      entityName: 'Alice',
      daysSinceLastContact: 30,
      averageGapDays: 7,
      decayRatio: 4.3,
    };

    const result = decayToAlert(decay);

    expect(result.type).toBe('relationship_decay');
    expect(result.priority).toBe(2);
    expect(result.title).toBe('Losing touch: Alice');
    expect(result.entityIds).toEqual(['ent-alice']);
    expect(result.timestamp).toBe('2026-03-10T12:00:00.000Z');
  });
});

describe('patternToAlert', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-10T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('converts PatternAlert to ProactiveAlert', () => {
    const pattern: PatternAlert = {
      type: 'pattern_detected',
      patternKind: 'frequency_change',
      priority: 3,
      title: 'Activity spike: Slack',
      details: 'Messages increased 3x',
      entityIds: ['ent-slack'],
      confidence: 0.85,
    };

    const result = patternToAlert(pattern);

    expect(result.type).toBe('pattern_detected');
    expect(result.priority).toBe(3);
    expect(result.title).toBe('Activity spike: Slack');
    expect(result.entityIds).toEqual(['ent-slack']);
    expect(result.timestamp).toBe('2026-03-10T12:00:00.000Z');
  });
});

describe('buildAlertKey', () => {
  it('builds key from type, title, and sorted entity IDs', () => {
    const alert: ProactiveAlert = {
      type: 'deadline_approaching',
      priority: 3,
      title: 'Due soon: Report',
      details: '',
      entityIds: ['ent-b', 'ent-a'],
      timestamp: '2026-03-10T12:00:00.000Z',
    };

    const key = buildAlertKey(alert);
    expect(key).toBe('deadline_approaching:Due soon: Report:ent-a,ent-b');
  });

  it('handles empty entityIds', () => {
    const alert: ProactiveAlert = {
      type: 'pattern_detected',
      priority: 2,
      title: 'Some pattern',
      details: '',
      entityIds: [],
      timestamp: '2026-03-10T12:00:00.000Z',
    };

    const key = buildAlertKey(alert);
    expect(key).toBe('pattern_detected:Some pattern:');
  });

  it('handles single entityId', () => {
    const alert: ProactiveAlert = {
      type: 'deadline_overdue',
      priority: 5,
      title: 'Overdue',
      details: '',
      entityIds: ['ent-only'],
      timestamp: '2026-03-10T12:00:00.000Z',
    };

    const key = buildAlertKey(alert);
    expect(key).toBe('deadline_overdue:Overdue:ent-only');
  });
});

describe('buildInsightContext', () => {
  it('returns empty string when no recent events', () => {
    const db = new Database(':memory:');
    applySchema(db);

    const result = buildInsightContext(db);
    expect(result).toBe('');
    db.close();
  });

  it('returns formatted context string from recent events', () => {
    const db = new Database(':memory:');
    applySchema(db);

    db.prepare(
      `INSERT INTO events (id, source, event_type, parsed_data, timestamp, importance)
       VALUES (?, ?, ?, ?, datetime('now'), ?)`,
    ).run('ev1', 'telegram', 'message', '{"text":"hello"}', 8);

    db.prepare(
      `INSERT INTO events (id, source, event_type, parsed_data, timestamp, importance)
       VALUES (?, ?, ?, ?, datetime('now'), ?)`,
    ).run('ev2', 'email', 'received', '{"subject":"meeting"}', 6);

    const result = buildInsightContext(db);
    expect(result).toContain('[telegram] message:');
    expect(result).toContain('[email] received:');
    expect(result).toContain('hello');
    expect(result).toContain('meeting');
    db.close();
  });

  it('excludes events older than 2 days', () => {
    const db = new Database(':memory:');
    applySchema(db);

    db.prepare(
      `INSERT INTO events (id, source, event_type, parsed_data, timestamp, importance)
       VALUES (?, ?, ?, ?, datetime('now', '-3 days'), ?)`,
    ).run('ev-old', 'telegram', 'old_message', '{"text":"old"}', 5);

    const result = buildInsightContext(db);
    expect(result).toBe('');
    db.close();
  });
});
