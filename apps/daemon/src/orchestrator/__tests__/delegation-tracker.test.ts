import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { applySchema } from '../../db/schema.js';
import { runMigrations } from '../../db/migrations.js';
import { DelegationTracker } from '../delegation-tracker.js';

describe('DelegationTracker', () => {
  let db: Database.Database;
  let tracker: DelegationTracker;

  beforeEach(() => {
    db = new Database(':memory:');
    applySchema(db);
    runMigrations(db);
    tracker = new DelegationTracker(db);
  });

  afterEach(() => {
    db.close();
  });

  function insertTask(id: string, priority = 'normal', status = 'pending'): void {
    db.prepare(
      `INSERT INTO agent_tasks (id, workspace_id, assigned_to, delegated_by, title, priority, status)
       VALUES (?, 'ws1', 'agent1', 'agent0', ?, ?, ?)`,
    ).run(id, `Task ${id}`, priority, status);
  }

  it('sets deadline based on priority', () => {
    insertTask('t1', 'critical');
    tracker.setDeadline('t1', 'critical');

    const row = db.prepare('SELECT deadline FROM agent_tasks WHERE id = ?').get('t1') as {
      deadline: string;
    };
    expect(row.deadline).toBeTruthy();
    expect(typeof row.deadline).toBe('string');
  });

  it('sets deadline with custom minutes', () => {
    insertTask('t1');
    tracker.setDeadline('t1', 'normal', 5);

    const row = db.prepare('SELECT deadline FROM agent_tasks WHERE id = ?').get('t1') as {
      deadline: string;
    };
    expect(row.deadline).toBeTruthy();
  });

  it('getOverdueTasks returns overdue tasks only', () => {
    insertTask('t1');
    insertTask('t2');

    // Set t1 deadline to the past
    db.prepare(
      `UPDATE agent_tasks SET deadline = datetime('now', '-10 minutes') WHERE id = 't1'`,
    ).run();
    // Set t2 deadline to the future
    db.prepare(
      `UPDATE agent_tasks SET deadline = datetime('now', '+60 minutes') WHERE id = 't2'`,
    ).run();

    const overdue = tracker.getOverdueTasks();
    expect(overdue).toHaveLength(1);
    expect(overdue[0]!.id).toBe('t1');
  });

  it('getOverdueTasks ignores completed tasks', () => {
    insertTask('t1', 'normal', 'completed');
    db.prepare(
      `UPDATE agent_tasks SET deadline = datetime('now', '-10 minutes') WHERE id = 't1'`,
    ).run();

    const overdue = tracker.getOverdueTasks();
    expect(overdue).toHaveLength(0);
  });

  it('getOverdueTasks ignores tasks without deadline', () => {
    insertTask('t1');
    // No deadline set

    const overdue = tracker.getOverdueTasks();
    expect(overdue).toHaveLength(0);
  });

  it('markCompleted updates status and completed_at', () => {
    insertTask('t1');
    tracker.markCompleted('t1');

    const row = db
      .prepare('SELECT status, completed_at FROM agent_tasks WHERE id = ?')
      .get('t1') as {
      status: string;
      completed_at: string | null;
    };
    expect(row.status).toBe('completed');
    expect(row.completed_at).toBeTruthy();
  });

  it('markCancelled updates status', () => {
    insertTask('t1');
    tracker.markCancelled('t1');

    const row = db.prepare('SELECT status FROM agent_tasks WHERE id = ?').get('t1') as {
      status: string;
    };
    expect(row.status).toBe('cancelled');
  });

  it('overdue tasks have correct shape', () => {
    insertTask('t1', 'high');
    db.prepare(
      `UPDATE agent_tasks SET deadline = datetime('now', '-5 minutes') WHERE id = 't1'`,
    ).run();

    const overdue = tracker.getOverdueTasks();
    expect(overdue).toHaveLength(1);
    const task = overdue[0]!;
    expect(task.id).toBe('t1');
    expect(task.workspaceId).toBe('ws1');
    expect(task.assignedTo).toBe('agent1');
    expect(task.delegatedBy).toBe('agent0');
    expect(task.priority).toBe('high');
    expect(task.deadline).toBeTruthy();
  });
});
