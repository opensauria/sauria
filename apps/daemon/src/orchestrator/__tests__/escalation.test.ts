import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { applySchema } from '../../db/schema.js';
import { EscalationManager } from '../escalation.js';

describe('EscalationManager', () => {
  let db: Database.Database;
  let manager: EscalationManager;

  beforeEach(() => {
    db = new Database(':memory:');
    applySchema(db);
    manager = new EscalationManager(db);
  });

  afterEach(() => {
    db.close();
  });

  it('creates escalation table on construction', () => {
    const info = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='escalations'")
      .get();
    expect(info).toBeTruthy();
  });

  it('creates an escalation and returns an id', () => {
    const id = manager.create('node1', 'conv1', 'Need help with billing');
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('findPendingForChannel returns matching escalation', () => {
    manager.create('node1', 'conv1', 'Issue from node1');
    manager.create('node2', 'conv2', 'Issue from node2');

    const pending = manager.findPendingForChannel('node1');
    expect(pending).not.toBeNull();
    expect(pending!.sourceNodeId).toBe('node1');
    expect(pending!.summary).toBe('Issue from node1');
  });

  it('findPendingForChannel returns null when no match', () => {
    manager.create('node1', 'conv1', 'Issue from node1');

    const pending = manager.findPendingForChannel('node99');
    expect(pending).toBeNull();
  });

  it('findPendingForChannel ignores resolved escalations', () => {
    const id = manager.create('node1', 'conv1', 'Resolved issue');
    manager.resolve(id);

    const pending = manager.findPendingForChannel('node1');
    expect(pending).toBeNull();
  });

  it('findMostRecentPending returns null when no pending escalations', () => {
    expect(manager.findMostRecentPending()).toBeNull();
  });

  it('findMostRecentPending returns the most recent pending escalation', () => {
    manager.create('node1', 'conv1', 'First issue');
    manager.create('node2', 'conv2', 'Second issue');

    const pending = manager.findMostRecentPending();
    expect(pending).not.toBeNull();
    expect(pending!.sourceNodeId).toBe('node2');
    expect(pending!.summary).toBe('Second issue');
    expect(pending!.status).toBe('pending');
    expect(pending!.resolvedAt).toBeNull();
  });

  it('resolve marks an escalation as resolved', () => {
    const id = manager.create('node1', 'conv1', 'Urgent issue');

    manager.resolve(id);

    const pending = manager.findMostRecentPending();
    expect(pending).toBeNull();
  });

  it('resolve sets resolvedAt timestamp', () => {
    const id = manager.create('node1', 'conv1', 'Issue');
    manager.resolve(id);

    const row = db.prepare('SELECT * FROM escalations WHERE id = ?').get(id) as Record<
      string,
      unknown
    >;
    expect(row['status']).toBe('resolved');
    expect(row['resolved_at']).not.toBeNull();
  });

  it('findMostRecentPending skips resolved escalations', () => {
    const id1 = manager.create('node1', 'conv1', 'Old issue');
    manager.create('node2', 'conv2', 'New issue');

    manager.resolve(id1);

    const pending = manager.findMostRecentPending();
    expect(pending!.sourceNodeId).toBe('node2');
  });

  it('getPendingCount returns 0 when no pending', () => {
    expect(manager.getPendingCount()).toBe(0);
  });

  it('getPendingCount returns correct count', () => {
    manager.create('node1', 'conv1', 'Issue 1');
    manager.create('node2', 'conv2', 'Issue 2');
    manager.create('node3', 'conv3', 'Issue 3');

    expect(manager.getPendingCount()).toBe(3);
  });

  it('getPendingCount decrements after resolve', () => {
    const id = manager.create('node1', 'conv1', 'Issue');
    manager.create('node2', 'conv2', 'Issue 2');

    manager.resolve(id);

    expect(manager.getPendingCount()).toBe(1);
  });

  it('preserves conversationId in escalation record', () => {
    const id = manager.create('node1', 'my-conversation-123', 'Help needed');
    const pending = manager.findMostRecentPending();

    expect(pending!.id).toBe(id);
    expect(pending!.conversationId).toBe('my-conversation-123');
  });

  it('findMostRecentPending returns correct createdAt format', () => {
    manager.create('node1', 'conv1', 'Issue');
    const pending = manager.findMostRecentPending();

    expect(pending!.createdAt).toBeTruthy();
    expect(typeof pending!.createdAt).toBe('string');
  });
});
