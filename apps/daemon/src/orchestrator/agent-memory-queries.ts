import type BetterSqlite3 from 'better-sqlite3';
import type { AgentMessage } from './agent-memory.js';

// ─── Row Types ──────────────────────────────────────────────────────

interface AgentMessageRow {
  readonly id: string;
  readonly conversation_id: string;
  readonly source_node_id: string;
  readonly sender_id: string;
  readonly sender_is_ceo: number;
  readonly platform: string;
  readonly group_id: string | null;
  readonly content: string;
  readonly content_type: string;
  readonly routing_decision: string | null;
  readonly created_at: string;
}

interface AgentFactRow {
  readonly fact: string;
}

interface ConversationRow {
  readonly id: string;
}

// ─── Type Guards ────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function isAgentMessageRow(value: unknown): value is AgentMessageRow {
  if (!isRecord(value)) return false;
  return (
    typeof value['id'] === 'string' &&
    typeof value['conversation_id'] === 'string' &&
    typeof value['content'] === 'string'
  );
}

export function isAgentFactRow(value: unknown): value is AgentFactRow {
  if (!isRecord(value)) return false;
  return typeof value['fact'] === 'string';
}

export function isConversationRow(value: unknown): value is ConversationRow {
  if (!isRecord(value)) return false;
  return typeof value['id'] === 'string';
}

// ─── Converters ─────────────────────────────────────────────────────

export function toAgentMessage(row: AgentMessageRow): AgentMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    sourceNodeId: row.source_node_id,
    senderId: row.sender_id,
    senderIsOwner: row.sender_is_ceo === 1,
    platform: row.platform,
    groupId: row.group_id,
    content: row.content,
    contentType: row.content_type,
    routingDecision: row.routing_decision,
    createdAt: row.created_at,
  };
}

// ─── Query Functions ────────────────────────────────────────────────

export function queryAgentFacts(
  db: BetterSqlite3.Database,
  nodeId: string,
  limit: number,
): string[] {
  const rows: unknown[] = db
    .prepare(
      `SELECT fact FROM agent_memory
       WHERE node_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .all(nodeId, limit);

  return rows.filter(isAgentFactRow).map((row) => row.fact);
}

export function queryWorkspaceFacts(
  db: BetterSqlite3.Database,
  workspaceId: string,
  limit: number,
): string[] {
  const rows: unknown[] = db
    .prepare(
      `SELECT fact FROM agent_memory
       WHERE workspace_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .all(workspaceId, limit);

  return rows.filter(isAgentFactRow).map((row) => row.fact);
}

export function queryConversationHistory(
  db: BetterSqlite3.Database,
  conversationId: string,
  limit: number,
): AgentMessage[] {
  const rows: unknown[] = db
    .prepare(
      `SELECT * FROM agent_messages
       WHERE conversation_id = ?
       ORDER BY rowid DESC
       LIMIT ?`,
    )
    .all(conversationId, limit);

  return rows.filter(isAgentMessageRow).map(toAgentMessage).reverse();
}

export function queryHistoryWithinBudget(
  db: BetterSqlite3.Database,
  conversationId: string,
  maxTokens: number,
): AgentMessage[] {
  if (maxTokens <= 0) return [];

  const rows: unknown[] = db
    .prepare(
      `SELECT * FROM agent_messages
       WHERE conversation_id = ?
       ORDER BY rowid DESC
       LIMIT 50`,
    )
    .all(conversationId);

  const allMessages = rows.filter(isAgentMessageRow).map(toAgentMessage);
  const result: AgentMessage[] = [];
  let tokenCount = 0;

  for (const msg of allMessages) {
    const msgTokens = Math.ceil(msg.content.length / 4);
    if (tokenCount + msgTokens > maxTokens) break;
    tokenCount += msgTokens;
    result.push(msg);
  }

  return result.reverse();
}
