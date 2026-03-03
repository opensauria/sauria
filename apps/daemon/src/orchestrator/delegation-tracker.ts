import type BetterSqlite3 from 'better-sqlite3';

export interface OverdueTask {
  readonly id: string;
  readonly workspaceId: string;
  readonly assignedTo: string;
  readonly delegatedBy: string | null;
  readonly title: string;
  readonly priority: string;
  readonly deadline: string;
}

interface TaskRow {
  readonly id: string;
  readonly workspace_id: string;
  readonly assigned_to: string;
  readonly delegated_by: string | null;
  readonly title: string;
  readonly priority: string;
  readonly deadline: string;
}

const DEADLINE_MINUTES: Readonly<Record<string, number>> = {
  critical: 30,
  high: 120,
  normal: 480,
  low: 1440,
};

export class DelegationTracker {
  constructor(private readonly db: BetterSqlite3.Database) {}

  setDeadline(taskId: string, priority: string, customMinutes?: number): void {
    const minutes = customMinutes ?? DEADLINE_MINUTES[priority] ?? DEADLINE_MINUTES['normal']!;
    this.db
      .prepare(
        `UPDATE agent_tasks SET deadline = datetime('now', '+' || ? || ' minutes') WHERE id = ?`,
      )
      .run(minutes, taskId);
  }

  getOverdueTasks(): readonly OverdueTask[] {
    const rows = this.db
      .prepare(
        `SELECT id, workspace_id, assigned_to, delegated_by, title, priority, deadline
         FROM agent_tasks
         WHERE status IN ('pending', 'active')
           AND deadline IS NOT NULL
           AND deadline < datetime('now')
         ORDER BY deadline ASC`,
      )
      .all() as TaskRow[];

    return rows.map(rowToOverdueTask);
  }

  markCompleted(taskId: string): void {
    this.db
      .prepare(
        `UPDATE agent_tasks SET status = 'completed', completed_at = datetime('now') WHERE id = ?`,
      )
      .run(taskId);
  }

  markCancelled(taskId: string): void {
    this.db.prepare(`UPDATE agent_tasks SET status = 'cancelled' WHERE id = ?`).run(taskId);
  }
}

function rowToOverdueTask(row: TaskRow): OverdueTask {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    assignedTo: row.assigned_to,
    delegatedBy: row.delegated_by,
    title: row.title,
    priority: row.priority,
    deadline: row.deadline,
  };
}
