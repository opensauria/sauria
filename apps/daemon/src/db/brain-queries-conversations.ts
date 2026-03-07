import type BetterSqlite3 from 'better-sqlite3';
import { isCountRow, DEFAULT_LIMIT } from './brain-queries-shared.js';
import type { PaginationOpts, PaginatedResult } from './brain-queries-shared.js';

// ─── Event Queries ──────────────────────────────────────────────────────

interface ListEventsOpts extends PaginationOpts {
  readonly source?: string;
  readonly search?: string;
}

export function listEvents(
  db: BetterSqlite3.Database,
  opts: ListEventsOpts = {},
): PaginatedResult<Record<string, unknown>> {
  const { offset = 0, limit = DEFAULT_LIMIT, source, search } = opts;

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (source) {
    conditions.push('source = ?');
    params.push(source);
  }
  if (search) {
    const like = `%${search}%`;
    conditions.push('(source LIKE ? OR event_type LIKE ?)');
    params.push(like, like);
  }

  const where = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';

  const countRow = db.prepare(`SELECT COUNT(*) as total FROM events${where}`).get(...params);
  const total = isCountRow(countRow) ? countRow.total : 0;

  const queryParams = [...params, limit, offset];
  const rows = db
    .prepare(`SELECT * FROM events${where} ORDER BY timestamp DESC LIMIT ? OFFSET ?`)
    .all(...queryParams) as Record<string, unknown>[];

  return { rows, total };
}

// ─── Conversation Queries ───────────────────────────────────────────────

interface ListConversationsOpts extends PaginationOpts {
  readonly platform?: string;
  readonly search?: string;
  readonly nodeIds?: readonly string[];
}

export function listConversations(
  db: BetterSqlite3.Database,
  opts: ListConversationsOpts = {},
): PaginatedResult<Record<string, unknown>> {
  const { offset = 0, limit = DEFAULT_LIMIT, platform, search, nodeIds } = opts;

  if (search) {
    const like = `%${search}%`;
    const conditions: string[] = [];
    const params: unknown[] = [like];

    if (platform) {
      conditions.push('c.platform = ?');
      params.push(platform);
    }

    if (nodeIds && nodeIds.length > 0) {
      for (const nid of nodeIds) {
        conditions.push(
          `EXISTS (SELECT 1 FROM JSON_EACH(c.participant_node_ids) j WHERE j.value = ?)`,
        );
        params.push(nid);
      }
    }

    const platformWhere = conditions.length > 0 ? ` AND ${conditions.join(' AND ')}` : '';

    const countRow = db
      .prepare(
        `SELECT COUNT(DISTINCT c.id) as total FROM agent_conversations c
         INNER JOIN agent_messages m ON m.conversation_id = c.id
         WHERE m.content LIKE ?${platformWhere}`,
      )
      .get(...params);
    const total = isCountRow(countRow) ? countRow.total : 0;

    const queryParams = [...params, limit, offset];
    const rows = db
      .prepare(
        `SELECT DISTINCT c.* FROM agent_conversations c
         INNER JOIN agent_messages m ON m.conversation_id = c.id
         WHERE m.content LIKE ?${platformWhere}
         ORDER BY c.last_message_at DESC LIMIT ? OFFSET ?`,
      )
      .all(...queryParams) as Record<string, unknown>[];

    return { rows, total };
  }

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (platform) {
    conditions.push('platform = ?');
    params.push(platform);
  }

  if (nodeIds && nodeIds.length > 0) {
    for (const nid of nodeIds) {
      conditions.push(
        `EXISTS (SELECT 1 FROM JSON_EACH(participant_node_ids) j WHERE j.value = ?)`,
      );
      params.push(nid);
    }
  }

  const where = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';

  const countRow = db
    .prepare(`SELECT COUNT(*) as total FROM agent_conversations${where}`)
    .get(...params);
  const total = isCountRow(countRow) ? countRow.total : 0;

  const queryParams = [...params, limit, offset];
  const rows = db
    .prepare(
      `SELECT * FROM agent_conversations${where}
       ORDER BY last_message_at DESC LIMIT ? OFFSET ?`,
    )
    .all(...queryParams) as Record<string, unknown>[];

  return { rows, total };
}

export function getConversationMessages(
  db: BetterSqlite3.Database,
  conversationId: string,
  opts: PaginationOpts = {},
): PaginatedResult<Record<string, unknown>> {
  const { offset = 0, limit = DEFAULT_LIMIT } = opts;

  const countRow = db
    .prepare('SELECT COUNT(*) as total FROM agent_messages WHERE conversation_id = ?')
    .get(conversationId);
  const total = isCountRow(countRow) ? countRow.total : 0;

  const rows = db
    .prepare(
      `SELECT * FROM agent_messages WHERE conversation_id = ?
       ORDER BY created_at ASC LIMIT ? OFFSET ?`,
    )
    .all(conversationId, limit, offset) as Record<string, unknown>[];

  return { rows, total };
}

// ─── Facts / Agent Memory Queries ───────────────────────────────────────

interface ListFactsOpts extends PaginationOpts {
  readonly nodeId?: string;
  readonly workspaceId?: string;
  readonly search?: string;
}

export function listFacts(
  db: BetterSqlite3.Database,
  opts: ListFactsOpts = {},
): PaginatedResult<Record<string, unknown>> {
  const { offset = 0, limit = DEFAULT_LIMIT, nodeId, workspaceId, search } = opts;

  const conditions: string[] = [];
  const params: unknown[] = [];
  if (nodeId) {
    conditions.push('node_id = ?');
    params.push(nodeId);
  }
  if (workspaceId) {
    conditions.push('workspace_id = ?');
    params.push(workspaceId);
  }
  if (search) {
    conditions.push('fact LIKE ?');
    params.push(`%${search}%`);
  }
  const where = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';

  const countRow = db.prepare(`SELECT COUNT(*) as total FROM agent_memory${where}`).get(...params);
  const total = isCountRow(countRow) ? countRow.total : 0;

  const queryParams = [...params, limit, offset];
  const rows = db
    .prepare(`SELECT * FROM agent_memory${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(...queryParams) as Record<string, unknown>[];

  return { rows, total };
}
