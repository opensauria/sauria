import { createHash } from 'node:crypto';
import type BetterSqlite3 from 'better-sqlite3';

export interface AuditEntry {
  readonly id: number;
  readonly timestamp: string;
  readonly action: string;
  readonly details: string;
  readonly promptHash: string | null;
  readonly responseHash: string | null;
  readonly costUsd: number | null;
  readonly clientId: string | null;
  readonly success: boolean;
}

interface LogActionOptions {
  readonly promptHash?: string;
  readonly responseHash?: string;
  readonly costUsd?: number;
  readonly clientId?: string;
  readonly success?: boolean;
}

interface AuditRow {
  id: number;
  timestamp: string;
  action: string;
  details: string;
  prompt_hash: string | null;
  response_hash: string | null;
  cost_usd: number | null;
  client_id: string | null;
  success: number;
}

interface CostRow {
  total: number;
}

function isAuditRow(value: unknown): value is AuditRow {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const row = value as Record<string, unknown>;
  return typeof row['id'] === 'number' && typeof row['action'] === 'string';
}

function isCostRow(value: unknown): value is CostRow {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  return typeof (value as Record<string, unknown>)['total'] === 'number';
}

function mapRow(row: AuditRow): AuditEntry {
  return {
    id: row.id,
    timestamp: row.timestamp,
    action: row.action,
    details: row.details,
    promptHash: row.prompt_hash,
    responseHash: row.response_hash,
    costUsd: row.cost_usd,
    clientId: row.client_id,
    success: row.success === 1,
  };
}

function mapRows(rows: unknown[]): AuditEntry[] {
  return rows.filter(isAuditRow).map(mapRow);
}

export class AuditLogger {
  private readonly insertStmt: BetterSqlite3.Statement;
  private readonly selectRecentStmt: BetterSqlite3.Statement;
  private readonly selectSinceStmt: BetterSqlite3.Statement;
  private readonly selectRecentByTypeStmt: BetterSqlite3.Statement;
  private readonly selectSinceByTypeStmt: BetterSqlite3.Statement;
  private readonly selectTotalCostStmt: BetterSqlite3.Statement;
  private readonly selectTotalCostSinceStmt: BetterSqlite3.Statement;

  constructor(private readonly db: BetterSqlite3.Database) {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL DEFAULT (datetime('now')),
        action TEXT NOT NULL,
        details TEXT NOT NULL,
        prompt_hash TEXT,
        response_hash TEXT,
        cost_usd REAL,
        client_id TEXT,
        success INTEGER NOT NULL DEFAULT 1
      )
    `);

    this.insertStmt = this.db.prepare(`
      INSERT INTO audit_log (action, details, prompt_hash, response_hash, cost_usd, client_id, success)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    this.selectRecentStmt = this.db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT ?');

    this.selectRecentByTypeStmt = this.db.prepare(
      'SELECT * FROM audit_log WHERE action = ? ORDER BY id DESC LIMIT ?',
    );

    this.selectSinceStmt = this.db.prepare(
      'SELECT * FROM audit_log WHERE timestamp >= ? ORDER BY id DESC',
    );

    this.selectSinceByTypeStmt = this.db.prepare(
      'SELECT * FROM audit_log WHERE timestamp >= ? AND action = ? ORDER BY id DESC',
    );

    this.selectTotalCostStmt = this.db.prepare(
      'SELECT COALESCE(SUM(cost_usd), 0) AS total FROM audit_log',
    );

    this.selectTotalCostSinceStmt = this.db.prepare(
      'SELECT COALESCE(SUM(cost_usd), 0) AS total FROM audit_log WHERE timestamp >= ?',
    );
  }

  logAction(action: string, details: Record<string, unknown>, options?: LogActionOptions): void {
    const { promptHash, responseHash, costUsd, clientId, success } = options ?? {};

    this.insertStmt.run(
      action,
      JSON.stringify(details),
      promptHash ?? null,
      responseHash ?? null,
      costUsd ?? null,
      clientId ?? null,
      success === false ? 0 : 1,
    );
  }

  hashContent(content: string): string {
    return createHash('sha256').update(content).digest('hex');
  }

  getRecentActions(limit = 50, actionType?: string): AuditEntry[] {
    if (actionType) {
      return mapRows(this.selectRecentByTypeStmt.all(actionType, limit));
    }
    return mapRows(this.selectRecentStmt.all(limit));
  }

  getActionsSince(since: string, actionType?: string): AuditEntry[] {
    if (actionType) {
      return mapRows(this.selectSinceByTypeStmt.all(since, actionType));
    }
    return mapRows(this.selectSinceStmt.all(since));
  }

  getTotalCost(since?: string): number {
    const row = since ? this.selectTotalCostSinceStmt.get(since) : this.selectTotalCostStmt.get();

    if (!isCostRow(row)) {
      return 0;
    }

    return row.total;
  }
}
