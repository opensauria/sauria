import type BetterSqlite3 from 'better-sqlite3';
import { nanoid } from 'nanoid';
import type { RoutingAction } from './types.js';

export interface PendingApproval {
  readonly id: string;
  readonly agentId: string;
  readonly workspaceId: string;
  readonly description: string;
  readonly actions: readonly RoutingAction[];
  readonly createdAt: string;
  readonly status: 'pending' | 'approved' | 'rejected';
}

interface ApprovalRow {
  readonly id: string;
  readonly agent_id: string;
  readonly workspace_id: string;
  readonly description: string;
  readonly actions_json: string;
  readonly created_at: string;
  readonly status: string;
}

const APPROVALS_SCHEMA = `
  CREATE TABLE IF NOT EXISTS approvals (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    description TEXT NOT NULL,
    actions_json TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(status);
  CREATE INDEX IF NOT EXISTS idx_approvals_agent ON approvals(agent_id);
  CREATE INDEX IF NOT EXISTS idx_approvals_created ON approvals(created_at DESC);
`;

export class CheckpointManager {
  constructor(private readonly db: BetterSqlite3.Database) {
    this.db.exec(APPROVALS_SCHEMA);
  }

  queueForApproval(
    agentId: string,
    workspaceId: string,
    description: string,
    actions: RoutingAction[],
  ): string {
    const id = nanoid();
    const actionsJson = JSON.stringify(actions);

    this.db
      .prepare(
        `INSERT INTO approvals (id, agent_id, workspace_id, description, actions_json)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(id, agentId, workspaceId, description, actionsJson);

    return id;
  }

  getPending(): PendingApproval[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM approvals WHERE status = 'pending' ORDER BY created_at ASC`,
      )
      .all() as ApprovalRow[];

    return rows.map(rowToApproval);
  }

  approve(approvalId: string): RoutingAction[] {
    const row = this.db
      .prepare(`SELECT * FROM approvals WHERE id = ?`)
      .get(approvalId) as ApprovalRow | undefined;

    if (!row) {
      throw new Error(`Approval ${approvalId} not found`);
    }

    if (row.status !== 'pending') {
      throw new Error(
        `Approval ${approvalId} is already ${row.status}`,
      );
    }

    this.db
      .prepare(`UPDATE approvals SET status = 'approved' WHERE id = ?`)
      .run(approvalId);

    return JSON.parse(row.actions_json) as RoutingAction[];
  }

  reject(approvalId: string): void {
    const row = this.db
      .prepare(`SELECT * FROM approvals WHERE id = ?`)
      .get(approvalId) as ApprovalRow | undefined;

    if (!row) {
      throw new Error(`Approval ${approvalId} not found`);
    }

    if (row.status !== 'pending') {
      throw new Error(
        `Approval ${approvalId} is already ${row.status}`,
      );
    }

    this.db
      .prepare(`UPDATE approvals SET status = 'rejected' WHERE id = ?`)
      .run(approvalId);
  }

  getPendingCount(): number {
    const result = this.db
      .prepare(`SELECT COUNT(*) as count FROM approvals WHERE status = 'pending'`)
      .get() as { count: number };

    return result.count;
  }
}

function rowToApproval(row: ApprovalRow): PendingApproval {
  return {
    id: row.id,
    agentId: row.agent_id,
    workspaceId: row.workspace_id,
    description: row.description,
    actions: JSON.parse(row.actions_json) as RoutingAction[],
    createdAt: row.created_at,
    status: row.status as PendingApproval['status'],
  };
}
