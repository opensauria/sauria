import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { TaskManager } from '../tasks.js';
import { applySchema } from '../../db/schema.js';
import type { CreateTaskInput } from '../tasks.js';

function createTestDb(): InstanceType<typeof Database> {
  const db = new Database(':memory:');
  applySchema(db);
  return db;
}

describe('TaskManager', () => {
  let db: InstanceType<typeof Database>;
  let tasks: TaskManager;

  beforeEach(() => {
    db = createTestDb();
    tasks = new TaskManager(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('createTask', () => {
    it('creates a task with minimal input and returns it', () => {
      const task = tasks.createTask({ title: 'Buy milk' });

      expect(task.id).toBeDefined();
      expect(task.title).toBe('Buy milk');
      expect(task.status).toBe('pending');
      expect(task.priority).toBe('medium');
      expect(task.description).toBeNull();
      expect(task.entityIds).toBeNull();
      expect(task.scheduledFor).toBeNull();
      expect(task.completedAt).toBeNull();
      expect(task.createdAt).toBeDefined();
    });

    it('creates a task with all fields populated', () => {
      const input: CreateTaskInput = {
        title: 'Deploy v2',
        description: 'Production deploy',
        status: 'active',
        priority: 'critical',
        entityIds: ['ent-1', 'ent-2'],
        scheduledFor: '2026-03-15T10:00:00Z',
      };
      const task = tasks.createTask(input);

      expect(task.title).toBe('Deploy v2');
      expect(task.description).toBe('Production deploy');
      expect(task.status).toBe('active');
      expect(task.priority).toBe('critical');
      expect(task.entityIds).toEqual(['ent-1', 'ent-2']);
      expect(task.scheduledFor).toBe('2026-03-15T10:00:00Z');
    });

    it('generates unique IDs for each task', () => {
      const task1 = tasks.createTask({ title: 'Task A' });
      const task2 = tasks.createTask({ title: 'Task B' });
      expect(task1.id).not.toBe(task2.id);
    });
  });

  describe('getTask', () => {
    it('returns task by ID', () => {
      const created = tasks.createTask({ title: 'Findable' });
      const found = tasks.getTask(created.id);

      expect(found).toBeDefined();
      expect(found?.title).toBe('Findable');
    });

    it('returns undefined for non-existent ID', () => {
      expect(tasks.getTask('nope')).toBeUndefined();
    });
  });

  describe('updateTask', () => {
    it('updates title', () => {
      const created = tasks.createTask({ title: 'Old title' });
      tasks.updateTask(created.id, { title: 'New title' });
      expect(tasks.getTask(created.id)?.title).toBe('New title');
    });

    it('updates description', () => {
      const created = tasks.createTask({ title: 'T' });
      tasks.updateTask(created.id, { description: 'Details here' });
      expect(tasks.getTask(created.id)?.description).toBe('Details here');
    });

    it('updates priority', () => {
      const created = tasks.createTask({ title: 'T' });
      tasks.updateTask(created.id, { priority: 'high' });
      expect(tasks.getTask(created.id)?.priority).toBe('high');
    });

    it('updates scheduledFor', () => {
      const created = tasks.createTask({ title: 'T' });
      tasks.updateTask(created.id, { scheduledFor: '2026-04-01T09:00:00Z' });
      expect(tasks.getTask(created.id)?.scheduledFor).toBe('2026-04-01T09:00:00Z');
    });

    it('clears scheduledFor when set to null', () => {
      const created = tasks.createTask({
        title: 'T',
        scheduledFor: '2026-04-01T09:00:00Z',
      });
      tasks.updateTask(created.id, { scheduledFor: null });
      expect(tasks.getTask(created.id)?.scheduledFor).toBeNull();
    });

    it('sets completed_at when status changes to completed', () => {
      const created = tasks.createTask({ title: 'T' });
      tasks.updateTask(created.id, { status: 'completed' });
      const updated = tasks.getTask(created.id);
      expect(updated?.status).toBe('completed');
      expect(updated?.completedAt).toBeDefined();
    });

    it('does nothing when no fields provided', () => {
      const created = tasks.createTask({ title: 'Untouched' });
      tasks.updateTask(created.id, {});
      expect(tasks.getTask(created.id)?.title).toBe('Untouched');
    });
  });

  describe('getByStatus', () => {
    it('returns tasks filtered by status', () => {
      tasks.createTask({ title: 'Pending 1' });
      tasks.createTask({ title: 'Active 1', status: 'active' });
      tasks.createTask({ title: 'Pending 2' });

      const pending = tasks.getByStatus('pending');
      expect(pending).toHaveLength(2);
      expect(pending.every((t) => t.status === 'pending')).toBe(true);
    });

    it('returns empty array when no tasks match status', () => {
      tasks.createTask({ title: 'Pending' });
      expect(tasks.getByStatus('completed')).toHaveLength(0);
    });
  });

  describe('getByEntity', () => {
    it('returns tasks associated with given entity ID', () => {
      tasks.createTask({ title: 'Related', entityIds: ['ent-abc'] });
      tasks.createTask({ title: 'Unrelated', entityIds: ['ent-xyz'] });

      const results = tasks.getByEntity('ent-abc');
      expect(results).toHaveLength(1);
      expect(results[0]?.title).toBe('Related');
    });

    it('returns empty when entity ID not found', () => {
      tasks.createTask({ title: 'T', entityIds: ['ent-abc'] });
      expect(tasks.getByEntity('ent-nope')).toHaveLength(0);
    });
  });

  describe('getOverdue', () => {
    it('returns tasks past scheduled_for that are not completed or cancelled', () => {
      const past = new Date(Date.now() - 86_400_000).toISOString();
      tasks.createTask({ title: 'Overdue', scheduledFor: past });
      tasks.createTask({ title: 'Completed', scheduledFor: past, status: 'completed' });
      tasks.createTask({ title: 'Cancelled', scheduledFor: past, status: 'cancelled' });

      const overdue = tasks.getOverdue();
      expect(overdue).toHaveLength(1);
      expect(overdue[0]?.title).toBe('Overdue');
    });

    it('returns empty when no overdue tasks exist', () => {
      const future = new Date(Date.now() + 86_400_000).toISOString();
      tasks.createTask({ title: 'Future', scheduledFor: future });
      expect(tasks.getOverdue()).toHaveLength(0);
    });
  });

  describe('getPending', () => {
    it('returns pending and active tasks ordered by priority', () => {
      tasks.createTask({ title: 'Low', priority: 'low' });
      tasks.createTask({ title: 'Critical', priority: 'critical' });
      tasks.createTask({ title: 'High', priority: 'high', status: 'active' });
      tasks.createTask({ title: 'Done', priority: 'critical', status: 'completed' });

      const pending = tasks.getPending();
      expect(pending).toHaveLength(3);
      expect(pending[0]?.priority).toBe('critical');
      expect(pending[1]?.priority).toBe('high');
      expect(pending[2]?.priority).toBe('low');
    });
  });

  describe('completeTask', () => {
    it('sets status to completed and records completed_at', () => {
      const created = tasks.createTask({ title: 'Completable' });
      tasks.completeTask(created.id);

      const completed = tasks.getTask(created.id);
      expect(completed?.status).toBe('completed');
      expect(completed?.completedAt).toBeDefined();
    });
  });
});
