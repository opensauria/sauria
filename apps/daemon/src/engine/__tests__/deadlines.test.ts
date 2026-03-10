import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { scanDeadlines } from '../deadlines.js';
import type { DeadlineAlert } from '../deadlines.js';
import { applySchema } from '../../db/schema.js';

vi.mock('../../db/temporal.js', () => ({
  getUpcomingDeadlines: vi.fn(() => []),
}));

function createTestDb(): InstanceType<typeof Database> {
  const db = new Database(':memory:');
  applySchema(db);
  return db;
}

function insertTask(
  db: InstanceType<typeof Database>,
  overrides: Partial<{
    id: string;
    title: string;
    status: string;
    priority: string;
    scheduled_for: string;
    entity_ids: string;
  }> = {},
): void {
  const defaults = {
    id: `task-${Math.random().toString(36).slice(2, 8)}`,
    title: 'Test task',
    status: 'pending',
    priority: 'medium',
    scheduled_for: null as string | null,
    entity_ids: null as string | null,
  };
  const task = { ...defaults, ...overrides };
  db.prepare(
    "INSERT INTO tasks (id, title, status, priority, scheduled_for, entity_ids, created_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))",
  ).run(task.id, task.title, task.status, task.priority, task.scheduled_for, task.entity_ids);
}

describe('scanDeadlines', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-10T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns empty array when no tasks exist', () => {
    const db = createTestDb();
    const alerts = scanDeadlines(db);
    expect(alerts).toEqual([]);
    db.close();
  });

  it('ignores completed tasks', () => {
    const db = createTestDb();
    insertTask(db, {
      status: 'completed',
      scheduled_for: '2026-03-10T14:00:00.000Z',
    });
    const alerts = scanDeadlines(db);
    expect(alerts).toEqual([]);
    db.close();
  });

  it('ignores cancelled tasks', () => {
    const db = createTestDb();
    insertTask(db, {
      status: 'cancelled',
      scheduled_for: '2026-03-10T14:00:00.000Z',
    });
    const alerts = scanDeadlines(db);
    expect(alerts).toEqual([]);
    db.close();
  });

  it('marks overdue tasks with critical priority and numericPriority 5', () => {
    const db = createTestDb();
    insertTask(db, {
      title: 'Overdue task',
      scheduled_for: '2026-03-10T08:00:00.000Z',
    });
    const alerts = scanDeadlines(db);
    const overdue = alerts.find((a) => a.type === 'deadline_overdue');
    expect(overdue).toBeDefined();
    expect(overdue?.priority).toBe('critical');
    expect(overdue?.numericPriority).toBe(5);
    expect(overdue?.title).toBe('Overdue: Overdue task');
    expect(overdue?.hoursUntil).toBeLessThan(0);
    db.close();
  });

  it('classifies task due in less than 4 hours as critical', () => {
    const db = createTestDb();
    insertTask(db, {
      title: 'Urgent task',
      scheduled_for: '2026-03-10T14:00:00.000Z',
    });
    const alerts = scanDeadlines(db);
    const approaching = alerts.find((a) => a.type === 'deadline_approaching');
    expect(approaching).toBeDefined();
    expect(approaching?.priority).toBe('critical');
    expect(approaching?.numericPriority).toBe(4);
    db.close();
  });

  it('classifies task due in 4-24 hours as high', () => {
    const db = createTestDb();
    insertTask(db, {
      title: 'Soon task',
      scheduled_for: '2026-03-10T20:00:00.000Z',
    });
    const alerts = scanDeadlines(db);
    const approaching = alerts.find((a) => a.type === 'deadline_approaching');
    expect(approaching).toBeDefined();
    expect(approaching?.priority).toBe('high');
    expect(approaching?.numericPriority).toBe(3);
    db.close();
  });

  it('classifies task due in 24-72 hours as medium', () => {
    const db = createTestDb();
    insertTask(db, {
      title: 'Later task',
      scheduled_for: '2026-03-12T12:00:00.000Z',
    });
    const alerts = scanDeadlines(db);
    const approaching = alerts.find((a) => a.type === 'deadline_approaching');
    expect(approaching).toBeDefined();
    expect(approaching?.priority).toBe('medium');
    expect(approaching?.numericPriority).toBe(2);
    db.close();
  });

  it('ignores tasks scheduled more than 72 hours away', () => {
    const db = createTestDb();
    insertTask(db, {
      title: 'Far away task',
      scheduled_for: '2026-03-15T12:00:00.000Z',
    });
    const alerts = scanDeadlines(db);
    expect(alerts.filter((a) => a.type === 'deadline_approaching')).toHaveLength(0);
    db.close();
  });

  it('sorts alerts by numericPriority descending then hoursUntil ascending', () => {
    const db = createTestDb();
    insertTask(db, {
      id: 'task-medium',
      title: 'Medium task',
      scheduled_for: '2026-03-12T00:00:00.000Z',
    });
    insertTask(db, {
      id: 'task-overdue',
      title: 'Overdue task',
      scheduled_for: '2026-03-10T06:00:00.000Z',
    });
    insertTask(db, {
      id: 'task-critical',
      title: 'Critical task',
      scheduled_for: '2026-03-10T13:00:00.000Z',
    });

    const alerts = scanDeadlines(db);
    expect(alerts.length).toBeGreaterThanOrEqual(3);
    expect(alerts[0]?.type).toBe('deadline_overdue');
    expect(alerts[1]?.priority).toBe('critical');
    db.close();
  });

  it('parses entity_ids JSON into relatedEntityIds', () => {
    const db = createTestDb();
    insertTask(db, {
      title: 'Entity task',
      scheduled_for: '2026-03-10T14:00:00.000Z',
      entity_ids: '["ent-1","ent-2"]',
    });
    const alerts = scanDeadlines(db);
    const alert = alerts[0];
    expect(alert?.relatedEntityIds).toEqual(['ent-1', 'ent-2']);
    db.close();
  });

  it('returns empty relatedEntityIds when entity_ids is null', () => {
    const db = createTestDb();
    insertTask(db, {
      title: 'No entities task',
      scheduled_for: '2026-03-10T14:00:00.000Z',
    });
    const alerts = scanDeadlines(db);
    const alert = alerts[0];
    expect(alert?.relatedEntityIds).toEqual([]);
    db.close();
  });

  it('ignores tasks without scheduled_for', () => {
    const db = createTestDb();
    insertTask(db, {
      title: 'Unscheduled task',
      status: 'pending',
    });
    const alerts = scanDeadlines(db);
    expect(alerts).toEqual([]);
    db.close();
  });

  it('generates overdue details with hours ago', () => {
    const db = createTestDb();
    insertTask(db, {
      title: 'Way overdue',
      scheduled_for: '2026-03-10T06:00:00.000Z',
    });
    const alerts = scanDeadlines(db);
    const overdue = alerts.find((a) => a.type === 'deadline_overdue');
    expect(overdue?.details).toContain('6h ago');
    db.close();
  });

  it('generates approaching details with hours until', () => {
    const db = createTestDb();
    insertTask(db, {
      title: 'Soon task',
      scheduled_for: '2026-03-10T20:00:00.000Z',
    });
    const alerts = scanDeadlines(db);
    const approaching = alerts.find((a) => a.type === 'deadline_approaching');
    expect(approaching?.details).toContain('Due in 8h');
    db.close();
  });
});

describe('findConflicts via scanDeadlines', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-10T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('detects conflicts when events share entities within 1 hour', async () => {
    const { getUpcomingDeadlines } = await import('../../db/temporal.js');
    vi.mocked(getUpcomingDeadlines).mockReturnValue([
      {
        id: 'ev1',
        source: 'calendar',
        eventType: 'meeting-A',
        contentHash: null,
        parsedData: null,
        entityIds: ['ent-shared'],
        timestamp: '2026-03-10T14:00:00.000Z',
        processedAt: null,
        importance: 5,
      },
      {
        id: 'ev2',
        source: 'calendar',
        eventType: 'meeting-B',
        contentHash: null,
        parsedData: null,
        entityIds: ['ent-shared'],
        timestamp: '2026-03-10T14:30:00.000Z',
        processedAt: null,
        importance: 5,
      },
    ]);

    const db = createTestDb();
    const alerts = scanDeadlines(db);
    const conflicts = alerts.filter((a) => a.type === 'conflict');
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.priority).toBe('high');
    expect(conflicts[0]?.details).toContain('meeting-A');
    expect(conflicts[0]?.details).toContain('meeting-B');
    db.close();
  });

  it('does not detect conflict when events have no shared entities', async () => {
    const { getUpcomingDeadlines } = await import('../../db/temporal.js');
    vi.mocked(getUpcomingDeadlines).mockReturnValue([
      {
        id: 'ev1',
        source: 'calendar',
        eventType: 'meeting-A',
        contentHash: null,
        parsedData: null,
        entityIds: ['ent-1'],
        timestamp: '2026-03-10T14:00:00.000Z',
        processedAt: null,
        importance: 5,
      },
      {
        id: 'ev2',
        source: 'calendar',
        eventType: 'meeting-B',
        contentHash: null,
        parsedData: null,
        entityIds: ['ent-2'],
        timestamp: '2026-03-10T14:30:00.000Z',
        processedAt: null,
        importance: 5,
      },
    ]);

    const db = createTestDb();
    const alerts = scanDeadlines(db);
    const conflicts = alerts.filter((a) => a.type === 'conflict');
    expect(conflicts).toHaveLength(0);
    db.close();
  });

  it('does not detect conflict when events are more than 1 hour apart', async () => {
    const { getUpcomingDeadlines } = await import('../../db/temporal.js');
    vi.mocked(getUpcomingDeadlines).mockReturnValue([
      {
        id: 'ev1',
        source: 'calendar',
        eventType: 'meeting-A',
        contentHash: null,
        parsedData: null,
        entityIds: ['ent-shared'],
        timestamp: '2026-03-10T14:00:00.000Z',
        processedAt: null,
        importance: 5,
      },
      {
        id: 'ev2',
        source: 'calendar',
        eventType: 'meeting-B',
        contentHash: null,
        parsedData: null,
        entityIds: ['ent-shared'],
        timestamp: '2026-03-10T16:00:00.000Z',
        processedAt: null,
        importance: 5,
      },
    ]);

    const db = createTestDb();
    const alerts = scanDeadlines(db);
    const conflicts = alerts.filter((a) => a.type === 'conflict');
    expect(conflicts).toHaveLength(0);
    db.close();
  });
});
