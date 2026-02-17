import type BetterSqlite3 from 'better-sqlite3';
import { nanoid } from 'nanoid';

// ─── Types ──────────────────────────────────────────────────────────

export interface AgentMessage {
  readonly id: string;
  readonly conversationId: string;
  readonly sourceNodeId: string;
  readonly senderId: string;
  readonly senderIsCeo: boolean;
  readonly platform: string;
  readonly groupId: string | null;
  readonly content: string;
  readonly contentType: string;
  readonly routingDecision: string | null;
  readonly createdAt: string;
}

export interface RecordedMessage {
  readonly conversationId: string;
  readonly sourceNodeId: string;
  readonly senderId: string;
  readonly senderIsCeo: boolean;
  readonly platform: string;
  readonly groupId: string | null;
  readonly content: string;
  readonly contentType: string;
  readonly routingDecision?: string;
}

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

function isAgentMessageRow(value: unknown): value is AgentMessageRow {
  if (!isRecord(value)) return false;
  return (
    typeof value['id'] === 'string' &&
    typeof value['conversation_id'] === 'string' &&
    typeof value['content'] === 'string'
  );
}

function isAgentFactRow(value: unknown): value is AgentFactRow {
  if (!isRecord(value)) return false;
  return typeof value['fact'] === 'string';
}

function isConversationRow(value: unknown): value is ConversationRow {
  if (!isRecord(value)) return false;
  return typeof value['id'] === 'string';
}

// ─── Converters ─────────────────────────────────────────────────────

function toAgentMessage(row: AgentMessageRow): AgentMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    sourceNodeId: row.source_node_id,
    senderId: row.sender_id,
    senderIsCeo: row.sender_is_ceo === 1,
    platform: row.platform,
    groupId: row.group_id,
    content: row.content,
    contentType: row.content_type,
    routingDecision: row.routing_decision,
    createdAt: row.created_at,
  };
}

// ─── AgentMemory ────────────────────────────────────────────────────

export class AgentMemory {
  constructor(private readonly db: BetterSqlite3.Database) {}

  storeFact(
    nodeId: string,
    workspaceId: string | null,
    fact: string,
    topics: readonly string[],
    source: string,
  ): void {
    this.db
      .prepare(
        `INSERT INTO agent_memory (id, node_id, workspace_id, fact, topics, source)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(nanoid(), nodeId, workspaceId, fact, JSON.stringify(topics), source);
  }

  getAgentFacts(nodeId: string, limit: number): string[] {
    const rows: unknown[] = this.db
      .prepare(
        `SELECT fact FROM agent_memory
         WHERE node_id = ?
         ORDER BY created_at DESC
         LIMIT ?`,
      )
      .all(nodeId, limit);

    return rows.filter(isAgentFactRow).map((row) => row.fact);
  }

  getWorkspaceFacts(workspaceId: string, limit: number): string[] {
    const rows: unknown[] = this.db
      .prepare(
        `SELECT fact FROM agent_memory
         WHERE workspace_id = ?
         ORDER BY created_at DESC
         LIMIT ?`,
      )
      .all(workspaceId, limit);

    return rows.filter(isAgentFactRow).map((row) => row.fact);
  }

  getConversationHistory(conversationId: string, limit: number): AgentMessage[] {
    const rows: unknown[] = this.db
      .prepare(
        `SELECT * FROM agent_messages
         WHERE conversation_id = ?
         ORDER BY rowid DESC
         LIMIT ?`,
      )
      .all(conversationId, limit);

    return rows.filter(isAgentMessageRow).map(toAgentMessage).reverse();
  }

  recordMessage(message: RecordedMessage): void {
    this.db
      .prepare(
        `INSERT INTO agent_messages
           (id, conversation_id, source_node_id, sender_id, sender_is_ceo, platform, group_id, content, content_type, routing_decision)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        nanoid(),
        message.conversationId,
        message.sourceNodeId,
        message.senderId,
        message.senderIsCeo ? 1 : 0,
        message.platform,
        message.groupId,
        message.content,
        message.contentType,
        message.routingDecision ?? null,
      );

    this.db
      .prepare(
        `UPDATE agent_conversations
         SET last_message_at = datetime('now'), message_count = message_count + 1
         WHERE id = ?`,
      )
      .run(message.conversationId);
  }

  getOrCreateConversation(
    platform: string,
    groupId: string | null,
    participantNodeIds: readonly string[],
  ): string {
    const existing: unknown = groupId
      ? this.db
          .prepare(
            `SELECT id FROM agent_conversations
             WHERE platform = ? AND group_id = ?`,
          )
          .get(platform, groupId)
      : this.db
          .prepare(
            `SELECT id FROM agent_conversations
             WHERE platform = ? AND group_id IS NULL AND participant_node_ids = ?`,
          )
          .get(platform, JSON.stringify([...participantNodeIds].sort()));

    if (isConversationRow(existing)) {
      return existing.id;
    }

    const id = nanoid();
    this.db
      .prepare(
        `INSERT INTO agent_conversations (id, platform, group_id, participant_node_ids)
         VALUES (?, ?, ?, ?)`,
      )
      .run(id, platform, groupId, JSON.stringify([...participantNodeIds].sort()));

    return id;
  }
}
