import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { getDailySpend, recordSpend, isOverBudget } from '../budget.js';

function createBudgetDb(): Database.Database {
  return new Database(':memory:');
}

describe('budget', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createBudgetDb();
  });

  afterEach(() => {
    db.close();
  });

  describe('ensureBudgetTable (via getDailySpend)', () => {
    it('creates the budget_spend table on first call', () => {
      getDailySpend(db);
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='budget_spend'")
        .all();
      expect(tables).toHaveLength(1);
    });

    it('creates the idx_budget_spend_day index', () => {
      getDailySpend(db);
      const indexes = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_budget_spend_day'",
        )
        .all();
      expect(indexes).toHaveLength(1);
    });

    it('is idempotent when called multiple times', () => {
      getDailySpend(db);
      getDailySpend(db);
      recordSpend(db, 1, 'gpt-4');
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='budget_spend'")
        .all();
      expect(tables).toHaveLength(1);
    });
  });

  describe('getDailySpend', () => {
    it('returns 0 when no spend records exist', () => {
      expect(getDailySpend(db)).toBe(0);
    });

    it('sums spend for today', () => {
      recordSpend(db, 0.5, 'gpt-4');
      recordSpend(db, 1.2, 'claude-3');
      expect(getDailySpend(db)).toBeCloseTo(1.7);
    });

    it('ignores spend from other days', () => {
      recordSpend(db, 1.0, 'gpt-4');

      // Manually insert a record for yesterday
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yStr = yesterday.toISOString().slice(0, 10);
      db.prepare(
        'INSERT INTO budget_spend (amount, model, recorded_at, day) VALUES (?, ?, ?, ?)',
      ).run(5.0, 'old-model', yesterday.toISOString(), yStr);

      expect(getDailySpend(db)).toBeCloseTo(1.0);
    });
  });

  describe('recordSpend', () => {
    it('inserts a spend record and returns it', () => {
      const result = recordSpend(db, 0.75, 'claude-3');
      expect(result.amount).toBe(0.75);
      expect(result.model).toBe('claude-3');
      expect(result.recordedAt).toBeTruthy();
    });

    it('persists the record to the database', () => {
      recordSpend(db, 2.5, 'gpt-4');
      const rows = db.prepare('SELECT * FROM budget_spend').all();
      expect(rows).toHaveLength(1);
    });
  });

  describe('isOverBudget', () => {
    it('returns false when spend is under limit', () => {
      recordSpend(db, 1.0, 'gpt-4');
      expect(isOverBudget(db, 5.0)).toBe(false);
    });

    it('returns true when spend equals limit', () => {
      recordSpend(db, 5.0, 'gpt-4');
      expect(isOverBudget(db, 5.0)).toBe(true);
    });

    it('returns true when spend exceeds limit', () => {
      recordSpend(db, 3.0, 'gpt-4');
      recordSpend(db, 4.0, 'claude-3');
      expect(isOverBudget(db, 5.0)).toBe(true);
    });
  });

  describe('getTodayString (via recordSpend day)', () => {
    it('produces YYYY-MM-DD format', () => {
      recordSpend(db, 1.0, 'test');
      const row = db.prepare('SELECT day FROM budget_spend LIMIT 1').get() as { day: string };
      expect(row.day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });
});
