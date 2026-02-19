import type BetterSqlite3 from 'better-sqlite3';
import { nanoid } from 'nanoid';
import type { Task } from '../db/types.js';

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

function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    entityIds: row.entity_ids ? (JSON.parse(row.entity_ids) as string[]) : null,
    scheduledFor: row.scheduled_for,
    completedAt: row.completed_at,
    createdAt: row.created_at,
  };
}

export interface CreateTaskInput {
  readonly title: string;
  readonly description?: string;
  readonly status?: string;
  readonly priority?: string;
  readonly entityIds?: string[];
  readonly scheduledFor?: string;
}

export interface UpdateTaskInput {
  readonly title?: string;
  readonly description?: string;
  readonly status?: string;
  readonly priority?: string;
  readonly scheduledFor?: string | null;
}

export class TaskManager {
  private readonly insertStmt: BetterSqlite3.Statement;
  private readonly selectByIdStmt: BetterSqlite3.Statement;
  private readonly selectByStatusStmt: BetterSqlite3.Statement;
  private readonly selectByEntityStmt: BetterSqlite3.Statement;
  private readonly selectOverdueStmt: BetterSqlite3.Statement;
  private readonly selectPendingStmt: BetterSqlite3.Statement;
  private readonly completeStmt: BetterSqlite3.Statement;

  constructor(private readonly db: BetterSqlite3.Database) {
    this.insertStmt = db.prepare(`
      INSERT INTO tasks (id, title, description, status, priority, entity_ids, scheduled_for)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    this.selectByIdStmt = db.prepare('SELECT * FROM tasks WHERE id = ?');

    this.selectByStatusStmt = db.prepare(
      'SELECT * FROM tasks WHERE status = ? ORDER BY created_at DESC',
    );

    this.selectByEntityStmt = db.prepare(
      'SELECT t.* FROM tasks t, json_each(t.entity_ids) j WHERE j.value = ? ORDER BY t.created_at DESC',
    );

    this.selectOverdueStmt = db.prepare(
      "SELECT * FROM tasks WHERE scheduled_for < datetime('now') AND status NOT IN ('completed','cancelled') ORDER BY scheduled_for ASC",
    );

    this.selectPendingStmt = db.prepare(
      "SELECT * FROM tasks WHERE status IN ('pending','active') ORDER BY CASE priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 WHEN 'low' THEN 4 ELSE 5 END, created_at ASC",
    );

    this.completeStmt = db.prepare(
      "UPDATE tasks SET status = 'completed', completed_at = datetime('now') WHERE id = ?",
    );
  }

  createTask(input: CreateTaskInput): Task {
    const id = nanoid();
    const { title, description, status, priority, entityIds, scheduledFor } = input;

    this.insertStmt.run(
      id,
      title,
      description ?? null,
      status ?? 'pending',
      priority ?? 'medium',
      entityIds ? JSON.stringify(entityIds) : null,
      scheduledFor ?? null,
    );

    const row: unknown = this.selectByIdStmt.get(id);
    if (!isTaskRow(row)) {
      throw new Error(`Failed to retrieve created task: ${id}`);
    }
    return toTask(row);
  }

  updateTask(id: string, updates: UpdateTaskInput): void {
    const fields: string[] = [];
    const values: unknown[] = [];

    if (updates.title !== undefined) {
      fields.push('title = ?');
      values.push(updates.title);
    }
    if (updates.description !== undefined) {
      fields.push('description = ?');
      values.push(updates.description);
    }
    if (updates.priority !== undefined) {
      fields.push('priority = ?');
      values.push(updates.priority);
    }
    if (updates.scheduledFor !== undefined) {
      fields.push('scheduled_for = ?');
      values.push(updates.scheduledFor);
    }

    if (updates.status !== undefined) {
      fields.push('status = ?');
      values.push(updates.status);
      if (updates.status === 'completed') {
        fields.push("completed_at = datetime('now')");
      }
    }

    if (fields.length === 0) return;

    values.push(id);
    this.db.prepare(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  }

  getTask(id: string): Task | undefined {
    const row: unknown = this.selectByIdStmt.get(id);
    if (!isTaskRow(row)) return undefined;
    return toTask(row);
  }

  getByStatus(status: string): Task[] {
    const rows: unknown[] = this.selectByStatusStmt.all(status);
    return rows.filter(isTaskRow).map(toTask);
  }

  getByEntity(entityId: string): Task[] {
    const rows: unknown[] = this.selectByEntityStmt.all(entityId);
    return rows.filter(isTaskRow).map(toTask);
  }

  getOverdue(): Task[] {
    const rows: unknown[] = this.selectOverdueStmt.all();
    return rows.filter(isTaskRow).map(toTask);
  }

  getPending(): Task[] {
    const rows: unknown[] = this.selectPendingStmt.all();
    return rows.filter(isTaskRow).map(toTask);
  }

  completeTask(id: string): void {
    this.completeStmt.run(id);
  }
}
