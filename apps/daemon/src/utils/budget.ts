import type BetterSqlite3 from 'better-sqlite3';

interface SpendRow {
  total: number;
}

interface SpendRecord {
  readonly amount: number;
  readonly model: string;
  readonly recordedAt: string;
}

function isSpendRow(value: unknown): value is SpendRow {
  if (value === null || typeof value !== 'object') return false;
  return typeof (value as Record<string, unknown>)['total'] === 'number';
}

function ensureBudgetTable(db: BetterSqlite3.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS budget_spend (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      amount REAL NOT NULL,
      model TEXT NOT NULL,
      recorded_at TEXT NOT NULL DEFAULT (datetime('now')),
      day TEXT NOT NULL DEFAULT (date('now'))
    )
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_budget_spend_day ON budget_spend(day)');
}

function getTodayString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getDailySpend(db: BetterSqlite3.Database): number {
  ensureBudgetTable(db);
  const today = getTodayString();
  const row = db
    .prepare('SELECT COALESCE(SUM(amount), 0) AS total FROM budget_spend WHERE day = ?')
    .get(today);
  if (!isSpendRow(row)) return 0;
  return row.total;
}

export function recordSpend(
  db: BetterSqlite3.Database,
  amount: number,
  model: string,
): SpendRecord {
  ensureBudgetTable(db);
  const today = getTodayString();
  const now = new Date().toISOString();
  db.prepare('INSERT INTO budget_spend (amount, model, recorded_at, day) VALUES (?, ?, ?, ?)').run(
    amount,
    model,
    now,
    today,
  );
  return { amount, model, recordedAt: now };
}

export function isOverBudget(db: BetterSqlite3.Database, limit: number): boolean {
  const spent = getDailySpend(db);
  return spent >= limit;
}
