import type BetterSqlite3 from 'better-sqlite3';
import { nanoid } from 'nanoid';
import {
  isConversationRow,
  queryAgentFacts,
  queryWorkspaceFacts,
  queryConversationHistory,
  queryHistoryWithinBudget,
} from './agent-memory-queries.js';

// ─── Types ──────────────────────────────────────────────────────────

export interface AgentMessage {
  readonly id: string;
  readonly conversationId: string;
  readonly sourceNodeId: string;
  readonly senderId: string;
  readonly senderIsOwner: boolean;
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
  readonly senderIsOwner: boolean;
  readonly platform: string;
  readonly groupId: string | null;
  readonly content: string;
  readonly contentType: string;
  readonly routingDecision?: string;
}

// ─── Utilities ──────────────────────────────────────────────────────

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
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
    return queryAgentFacts(this.db, nodeId, limit);
  }

  getWorkspaceFacts(workspaceId: string, limit: number): string[] {
    return queryWorkspaceFacts(this.db, workspaceId, limit);
  }

  getRecentMessagesForContext(
    conversationId: string,
    limit: number,
    nodeLabels: ReadonlyMap<string, string>,
  ): string[] {
    const messages = this.getConversationHistory(conversationId, limit);
    return messages.map((msg) => {
      const sender = msg.senderIsOwner
        ? 'Owner'
        : (nodeLabels.get(msg.sourceNodeId) ?? msg.sourceNodeId);
      return `[${sender}] ${msg.content}`;
    });
  }

  getHistoryWithinBudget(conversationId: string, maxTokens: number): AgentMessage[] {
    return queryHistoryWithinBudget(this.db, conversationId, maxTokens);
  }

  getConversationHistory(conversationId: string, limit: number): AgentMessage[] {
    return queryConversationHistory(this.db, conversationId, limit);
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
        message.senderIsOwner ? 1 : 0,
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

  clearAgentConversations(nodeId: string): void {
    const rows = this.db
      .prepare(
        `SELECT id FROM agent_conversations
         WHERE participant_node_ids LIKE ?`,
      )
      .all(`%${nodeId}%`) as readonly { readonly id: string }[];

    for (const row of rows) {
      this.db.prepare(`DELETE FROM agent_messages WHERE conversation_id = ?`).run(row.id);
      this.db.prepare(`DELETE FROM agent_conversations WHERE id = ?`).run(row.id);
    }
  }
}
