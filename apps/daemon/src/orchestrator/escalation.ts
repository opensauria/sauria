import type BetterSqlite3 from 'better-sqlite3';
import { nanoid } from 'nanoid';

export interface PendingEscalation {
  readonly id: string;
  readonly sourceNodeId: string;
  readonly conversationId: string;
  readonly summary: string;
  readonly status: 'pending' | 'resolved';
  readonly createdAt: string;
  readonly resolvedAt: string | null;
}

interface EscalationRow {
  readonly id: string;
  readonly source_node_id: string;
  readonly conversation_id: string;
  readonly summary: string;
  readonly status: string;
  readonly created_at: string;
  readonly resolved_at: string | null;
}

const ESCALATIONS_SCHEMA = `
  CREATE TABLE IF NOT EXISTS escalations (
    id TEXT PRIMARY KEY,
    source_node_id TEXT NOT NULL,
    conversation_id TEXT NOT NULL,
    summary TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','resolved')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    resolved_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_escalations_status ON escalations(status);
  CREATE INDEX IF NOT EXISTS idx_escalations_created ON escalations(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_escalations_source_status ON escalations(source_node_id, status);
`;

export class EscalationManager {
  constructor(private readonly db: BetterSqlite3.Database) {
    this.db.exec(ESCALATIONS_SCHEMA);
  }

  create(sourceNodeId: string, conversationId: string, summary: string): string {
    const id = nanoid();
    this.db
      .prepare(
        `INSERT INTO escalations (id, source_node_id, conversation_id, summary)
         VALUES (?, ?, ?, ?)`,
      )
      .run(id, sourceNodeId, conversationId, summary);
    return id;
  }

  findPendingForChannel(channelNodeId: string): PendingEscalation | null {
    const row = this.db
      .prepare(
        `SELECT * FROM escalations WHERE status = 'pending' AND source_node_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1`,
      )
      .get(channelNodeId) as EscalationRow | undefined;

    return row ? rowToEscalation(row) : null;
  }

  findMostRecentPending(): PendingEscalation | null {
    const row = this.db
      .prepare(
        `SELECT * FROM escalations WHERE status = 'pending' ORDER BY created_at DESC, rowid DESC LIMIT 1`,
      )
      .get() as EscalationRow | undefined;

    return row ? rowToEscalation(row) : null;
  }

  resolve(id: string): void {
    this.db
      .prepare(
        `UPDATE escalations SET status = 'resolved', resolved_at = datetime('now') WHERE id = ?`,
      )
      .run(id);
  }

  getPendingCount(): number {
    const result = this.db
      .prepare(`SELECT COUNT(*) as count FROM escalations WHERE status = 'pending'`)
      .get() as { count: number };
    return result.count;
  }
}

function rowToEscalation(row: EscalationRow): PendingEscalation {
  return {
    id: row.id,
    sourceNodeId: row.source_node_id,
    conversationId: row.conversation_id,
    summary: row.summary,
    status: row.status as PendingEscalation['status'],
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
  };
}
