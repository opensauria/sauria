import type BetterSqlite3 from 'better-sqlite3';
import type { AgentPerformance, CanvasGraph, KPI } from './types.js';

export interface WorkspacePerformance {
  readonly totalMessages: number;
  readonly totalTasks: number;
  readonly totalCostUsd: number;
  readonly avgResponseTimeMs: number;
  readonly agentCount: number;
}

interface PerformanceRow {
  readonly node_id: string;
  readonly messages_handled: number;
  readonly tasks_completed: number;
  readonly total_response_time_ms: number;
  readonly cost_incurred_usd: number;
  readonly last_updated: string;
}

const PERFORMANCE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS agent_performance (
    node_id TEXT PRIMARY KEY,
    messages_handled INTEGER NOT NULL DEFAULT 0,
    tasks_completed INTEGER NOT NULL DEFAULT 0,
    total_response_time_ms INTEGER NOT NULL DEFAULT 0,
    cost_incurred_usd REAL NOT NULL DEFAULT 0,
    last_updated TEXT NOT NULL DEFAULT (datetime('now'))
  );
`;

export class KPITracker {
  constructor(private readonly db: BetterSqlite3.Database) {
    this.db.exec(PERFORMANCE_SCHEMA);
  }

  recordMessageHandled(nodeId: string, responseTimeMs: number): void {
    this.ensureRow(nodeId);

    this.db
      .prepare(
        `UPDATE agent_performance
         SET messages_handled = messages_handled + 1,
             total_response_time_ms = total_response_time_ms + ?,
             last_updated = datetime('now')
         WHERE node_id = ?`,
      )
      .run(responseTimeMs, nodeId);
  }

  recordTaskCompleted(nodeId: string): void {
    this.ensureRow(nodeId);

    this.db
      .prepare(
        `UPDATE agent_performance
         SET tasks_completed = tasks_completed + 1,
             last_updated = datetime('now')
         WHERE node_id = ?`,
      )
      .run(nodeId);
  }

  recordCost(nodeId: string, costUsd: number): void {
    this.ensureRow(nodeId);

    this.db
      .prepare(
        `UPDATE agent_performance
         SET cost_incurred_usd = cost_incurred_usd + ?,
             last_updated = datetime('now')
         WHERE node_id = ?`,
      )
      .run(costUsd, nodeId);
  }

  getPerformance(nodeId: string): AgentPerformance {
    const row = this.db.prepare(`SELECT * FROM agent_performance WHERE node_id = ?`).get(nodeId) as
      | PerformanceRow
      | undefined;

    if (!row) {
      return {
        messagesHandled: 0,
        tasksCompleted: 0,
        avgResponseTimeMs: 0,
        costIncurredUsd: 0,
      };
    }

    return rowToPerformance(row);
  }

  getKPIs(nodeId: string): KPI[] {
    const performance = this.getPerformance(nodeId);

    return [
      {
        name: 'Messages Handled',
        target: 100,
        current: performance.messagesHandled,
        unit: 'messages',
      },
      {
        name: 'Tasks Completed',
        target: 50,
        current: performance.tasksCompleted,
        unit: 'tasks',
      },
      {
        name: 'Avg Response Time',
        target: 2000,
        current: performance.avgResponseTimeMs,
        unit: 'ms',
      },
      {
        name: 'Cost Incurred',
        target: 10,
        current: performance.costIncurredUsd,
        unit: 'USD',
      },
    ];
  }

  getWorkspacePerformance(workspaceId: string, graph: CanvasGraph): WorkspacePerformance {
    const nodeIds = graph.nodes
      .filter((node) => node.workspaceId === workspaceId)
      .map((node) => node.id);

    if (nodeIds.length === 0) {
      return {
        totalMessages: 0,
        totalTasks: 0,
        totalCostUsd: 0,
        avgResponseTimeMs: 0,
        agentCount: 0,
      };
    }

    const placeholders = nodeIds.map(() => '?').join(',');
    const rows = this.db
      .prepare(`SELECT * FROM agent_performance WHERE node_id IN (${placeholders})`)
      .all(...nodeIds) as PerformanceRow[];

    let totalMessages = 0;
    let totalTasks = 0;
    let totalCostUsd = 0;
    let totalResponseTimeMs = 0;

    for (const row of rows) {
      totalMessages += row.messages_handled;
      totalTasks += row.tasks_completed;
      totalCostUsd += row.cost_incurred_usd;
      totalResponseTimeMs += row.total_response_time_ms;
    }

    const avgResponseTimeMs =
      totalMessages > 0 ? Math.round(totalResponseTimeMs / totalMessages) : 0;

    return {
      totalMessages,
      totalTasks,
      totalCostUsd,
      avgResponseTimeMs,
      agentCount: nodeIds.length,
    };
  }

  private ensureRow(nodeId: string): void {
    this.db.prepare(`INSERT OR IGNORE INTO agent_performance (node_id) VALUES (?)`).run(nodeId);
  }
}

function rowToPerformance(row: PerformanceRow): AgentPerformance {
  const avgResponseTimeMs =
    row.messages_handled > 0 ? Math.round(row.total_response_time_ms / row.messages_handled) : 0;

  return {
    messagesHandled: row.messages_handled,
    tasksCompleted: row.tasks_completed,
    avgResponseTimeMs,
    costIncurredUsd: row.cost_incurred_usd,
  };
}
