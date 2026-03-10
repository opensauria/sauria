import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';

import { AuditLogger } from '../audit.js';

describe('AuditLogger', () => {
  let db: InstanceType<typeof Database>;
  let logger: AuditLogger;

  beforeEach(() => {
    db = new Database(':memory:');
    logger = new AuditLogger(db);
  });

  describe('constructor', () => {
    it('creates the audit_log table', () => {
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='audit_log'")
        .all();
      expect(tables).toHaveLength(1);
    });
  });

  describe('logAction', () => {
    it('inserts a row with all fields', () => {
      logger.logAction(
        'test_action',
        { key: 'value' },
        {
          promptHash: 'phash',
          responseHash: 'rhash',
          costUsd: 0.05,
          clientId: 'client1',
          success: true,
        },
      );

      const rows = db.prepare('SELECT * FROM audit_log').all() as Array<Record<string, unknown>>;
      expect(rows).toHaveLength(1);
      expect(rows[0]!['action']).toBe('test_action');
      expect(rows[0]!['details']).toBe('{"key":"value"}');
      expect(rows[0]!['prompt_hash']).toBe('phash');
      expect(rows[0]!['response_hash']).toBe('rhash');
      expect(rows[0]!['cost_usd']).toBe(0.05);
      expect(rows[0]!['client_id']).toBe('client1');
      expect(rows[0]!['success']).toBe(1);
    });

    it('defaults success to 1 when not specified', () => {
      logger.logAction('action', { test: true });

      const rows = db.prepare('SELECT success FROM audit_log').all() as Array<
        Record<string, unknown>
      >;
      expect(rows[0]!['success']).toBe(1);
    });

    it('stores success as 0 when explicitly false', () => {
      logger.logAction('action', { test: true }, { success: false });

      const rows = db.prepare('SELECT success FROM audit_log').all() as Array<
        Record<string, unknown>
      >;
      expect(rows[0]!['success']).toBe(0);
    });

    it('stores null for optional fields when not provided', () => {
      logger.logAction('action', {});

      const rows = db.prepare('SELECT * FROM audit_log').all() as Array<Record<string, unknown>>;
      expect(rows[0]!['prompt_hash']).toBeNull();
      expect(rows[0]!['response_hash']).toBeNull();
      expect(rows[0]!['cost_usd']).toBeNull();
      expect(rows[0]!['client_id']).toBeNull();
    });
  });

  describe('hashContent', () => {
    it('returns SHA-256 hex digest', () => {
      const hash = logger.hashContent('test');
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('is deterministic (same input, same output)', () => {
      const hash1 = logger.hashContent('hello');
      const hash2 = logger.hashContent('hello');
      expect(hash1).toBe(hash2);
    });

    it('produces different output for different input', () => {
      const hash1 = logger.hashContent('foo');
      const hash2 = logger.hashContent('bar');
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('getRecentActions', () => {
    it('returns inserted entries', () => {
      logger.logAction('action_a', { n: 1 });
      logger.logAction('action_b', { n: 2 });

      const entries = logger.getRecentActions();
      expect(entries).toHaveLength(2);
    });

    it('respects limit', () => {
      for (let i = 0; i < 10; i++) {
        logger.logAction('action', { i });
      }

      const entries = logger.getRecentActions(3);
      expect(entries).toHaveLength(3);
    });

    it('filters by actionType', () => {
      logger.logAction('login', { user: 'a' });
      logger.logAction('logout', { user: 'a' });
      logger.logAction('login', { user: 'b' });

      const entries = logger.getRecentActions(50, 'login');
      expect(entries).toHaveLength(2);
      for (const entry of entries) {
        expect(entry.action).toBe('login');
      }
    });
  });

  describe('getActionsSince', () => {
    it('filters by timestamp', () => {
      logger.logAction('old', {});
      // All actions have same timestamp (datetime('now')), so they should all appear
      const entries = logger.getActionsSince('2000-01-01');
      expect(entries.length).toBeGreaterThanOrEqual(1);
    });

    it('filters by timestamp and actionType', () => {
      logger.logAction('alpha', {});
      logger.logAction('beta', {});

      const entries = logger.getActionsSince('2000-01-01', 'alpha');
      expect(entries).toHaveLength(1);
      expect(entries[0]!.action).toBe('alpha');
    });
  });

  describe('getTotalCost', () => {
    it('sums costs', () => {
      logger.logAction('a', {}, { costUsd: 0.1 });
      logger.logAction('b', {}, { costUsd: 0.25 });

      const total = logger.getTotalCost();
      expect(total).toBeCloseTo(0.35);
    });

    it('returns 0 when no entries exist', () => {
      expect(logger.getTotalCost()).toBe(0);
    });

    it('respects since filter', () => {
      logger.logAction('a', {}, { costUsd: 1.0 });

      // A far-future timestamp should yield 0
      const total = logger.getTotalCost('2099-01-01');
      expect(total).toBe(0);
    });
  });
});
