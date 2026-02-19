import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { CheckpointManager } from '../checkpoint.js';
import type { RoutingAction } from '../types.js';

describe('CheckpointManager', () => {
  let db: Database.Database;
  let manager: CheckpointManager;

  beforeEach(() => {
    db = new Database(':memory:');
    manager = new CheckpointManager(db);
  });

  afterEach(() => {
    db.close();
  });

  const sampleActions: RoutingAction[] = [
    { type: 'forward', targetNodeId: 'n2', content: 'check this' },
    { type: 'notify', targetNodeId: 'n3', summary: 'heads up' },
  ];

  describe('queueForApproval', () => {
    it('returns a non-empty id', () => {
      const id = manager.queueForApproval('agent1', 'ws1', 'Forward to billing', sampleActions);
      expect(id).toBeTruthy();
      expect(typeof id).toBe('string');
    });

    it('creates a pending approval retrievable by getPending', () => {
      manager.queueForApproval('agent1', 'ws1', 'Forward to billing', sampleActions);

      const pending = manager.getPending();
      expect(pending).toHaveLength(1);
      expect(pending[0]?.agentId).toBe('agent1');
      expect(pending[0]?.workspaceId).toBe('ws1');
      expect(pending[0]?.description).toBe('Forward to billing');
      expect(pending[0]?.status).toBe('pending');
      expect(pending[0]?.actions).toEqual(sampleActions);
    });
  });

  describe('getPending', () => {
    it('returns empty array when no approvals exist', () => {
      expect(manager.getPending()).toHaveLength(0);
    });

    it('only returns pending approvals', () => {
      const id1 = manager.queueForApproval('a1', 'ws1', 'action 1', sampleActions);
      manager.queueForApproval('a2', 'ws1', 'action 2', sampleActions);

      manager.approve(id1);

      const pending = manager.getPending();
      expect(pending).toHaveLength(1);
      expect(pending[0]?.description).toBe('action 2');
    });

    it('returns approvals in chronological order', () => {
      manager.queueForApproval('a1', 'ws1', 'first', sampleActions);
      manager.queueForApproval('a2', 'ws1', 'second', sampleActions);
      manager.queueForApproval('a3', 'ws1', 'third', sampleActions);

      const pending = manager.getPending();
      expect(pending).toHaveLength(3);
      expect(pending[0]?.description).toBe('first');
      expect(pending[1]?.description).toBe('second');
      expect(pending[2]?.description).toBe('third');
    });
  });

  describe('approve', () => {
    it('returns the queued actions', () => {
      const id = manager.queueForApproval('a1', 'ws1', 'forward msg', sampleActions);

      const actions = manager.approve(id);
      expect(actions).toEqual(sampleActions);
    });

    it('marks the approval as approved', () => {
      const id = manager.queueForApproval('a1', 'ws1', 'forward msg', sampleActions);

      manager.approve(id);

      const pending = manager.getPending();
      expect(pending).toHaveLength(0);
    });

    it('throws when approval not found', () => {
      expect(() => manager.approve('nonexistent')).toThrow('Approval nonexistent not found');
    });

    it('throws when approving an already approved item', () => {
      const id = manager.queueForApproval('a1', 'ws1', 'action', sampleActions);
      manager.approve(id);

      expect(() => manager.approve(id)).toThrow('already approved');
    });

    it('throws when approving a rejected item', () => {
      const id = manager.queueForApproval('a1', 'ws1', 'action', sampleActions);
      manager.reject(id);

      expect(() => manager.approve(id)).toThrow('already rejected');
    });
  });

  describe('reject', () => {
    it('marks the approval as rejected', () => {
      const id = manager.queueForApproval('a1', 'ws1', 'forward msg', sampleActions);

      manager.reject(id);

      const pending = manager.getPending();
      expect(pending).toHaveLength(0);
    });

    it('throws when approval not found', () => {
      expect(() => manager.reject('nonexistent')).toThrow('Approval nonexistent not found');
    });

    it('throws when rejecting an already rejected item', () => {
      const id = manager.queueForApproval('a1', 'ws1', 'action', sampleActions);
      manager.reject(id);

      expect(() => manager.reject(id)).toThrow('already rejected');
    });
  });

  describe('getPendingCount', () => {
    it('returns 0 when no approvals exist', () => {
      expect(manager.getPendingCount()).toBe(0);
    });

    it('returns count of pending approvals', () => {
      manager.queueForApproval('a1', 'ws1', 'action 1', sampleActions);
      manager.queueForApproval('a2', 'ws1', 'action 2', sampleActions);
      manager.queueForApproval('a3', 'ws1', 'action 3', sampleActions);

      expect(manager.getPendingCount()).toBe(3);
    });

    it('decrements when approvals are resolved', () => {
      const id1 = manager.queueForApproval('a1', 'ws1', 'action 1', sampleActions);
      const id2 = manager.queueForApproval('a2', 'ws1', 'action 2', sampleActions);
      manager.queueForApproval('a3', 'ws1', 'action 3', sampleActions);

      manager.approve(id1);
      manager.reject(id2);

      expect(manager.getPendingCount()).toBe(1);
    });
  });

  describe('schema idempotency', () => {
    it('can create CheckpointManager twice on the same db', () => {
      const manager2 = new CheckpointManager(db);
      manager2.queueForApproval('a1', 'ws1', 'test', sampleActions);
      expect(manager2.getPendingCount()).toBe(1);
    });
  });
});
