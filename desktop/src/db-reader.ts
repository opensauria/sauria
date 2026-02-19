import Database from 'better-sqlite3';
import type BetterSqlite3 from 'better-sqlite3';
import { join } from 'path';
import { homedir } from 'os';
import { existsSync } from 'fs';

const DB_PATH = join(homedir(), '.openwind', 'world.db');

let db: BetterSqlite3.Database | null = null;

export function getDb(): BetterSqlite3.Database {
  if (db) return db;
  if (!existsSync(DB_PATH)) {
    throw new Error(`Database not found at ${DB_PATH}`);
  }
  db = new Database(DB_PATH, { readonly: false });
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.pragma('synchronous = NORMAL');
  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

// ─── Type Guards ────────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isCountRow(value: unknown): value is { total: number } {
  return isRecord(value) && typeof value['total'] === 'number';
}

// ─── FTS5 Sanitization ─────────────────────────────────────────────────

const FTS5_SPECIAL = /[?"'*+\-(){}^:]/g;

function sanitizeFtsQuery(raw: string): string {
  const cleaned = raw.replace(FTS5_SPECIAL, ' ').trim();
  const terms = cleaned.split(/\s+/).filter((t) => t.length > 0);
  if (terms.length === 0) return '';
  return terms.map((t) => `"${t}"`).join(' ');
}

// ─── Pagination ─────────────────────────────────────────────────────────

interface PaginationOpts {
  readonly offset?: number;
  readonly limit?: number;
}

interface PaginatedResult<T> {
  readonly rows: T[];
  readonly total: number;
}

const DEFAULT_LIMIT = 50;

// ─── Entity Queries ─────────────────────────────────────────────────────

interface ListEntitiesOpts extends PaginationOpts {
  readonly type?: string;
  readonly search?: string;
}

export function listEntities(opts: ListEntitiesOpts = {}): PaginatedResult<Record<string, unknown>> {
  const d = getDb();
  const { offset = 0, limit = DEFAULT_LIMIT, type, search } = opts;

  if (search) {
    const ftsQuery = sanitizeFtsQuery(search);
    if (!ftsQuery) return { rows: [], total: 0 };

    const whereType = type ? ' AND e.type = ?' : '';
    const countParams: unknown[] = [ftsQuery];
    const queryParams: unknown[] = [ftsQuery];
    if (type) {
      countParams.push(type);
      queryParams.push(type);
    }

    const countRow = d
      .prepare(
        `SELECT COUNT(*) as total FROM entities e
         INNER JOIN entities_fts fts ON e.rowid = fts.rowid
         WHERE entities_fts MATCH ?${whereType}`,
      )
      .get(...countParams);
    const total = isCountRow(countRow) ? countRow.total : 0;

    queryParams.push(limit, offset);
    const rows = d
      .prepare(
        `SELECT e.* FROM entities e
         INNER JOIN entities_fts fts ON e.rowid = fts.rowid
         WHERE entities_fts MATCH ?${whereType}
         ORDER BY fts.rank LIMIT ? OFFSET ?`,
      )
      .all(...queryParams) as Record<string, unknown>[];

    return { rows, total };
  }

  const whereType = type ? ' WHERE type = ?' : '';
  const countParams: unknown[] = type ? [type] : [];
  const countRow = d
    .prepare(`SELECT COUNT(*) as total FROM entities${whereType}`)
    .get(...countParams);
  const total = isCountRow(countRow) ? countRow.total : 0;

  const queryParams: unknown[] = type ? [type, limit, offset] : [limit, offset];
  const rows = d
    .prepare(
      `SELECT * FROM entities${whereType} ORDER BY importance_score DESC, last_updated_at DESC LIMIT ? OFFSET ?`,
    )
    .all(...queryParams) as Record<string, unknown>[];

  return { rows, total };
}

export function getEntityDetail(
  id: string,
): { entity: Record<string, unknown>; relations: Record<string, unknown>[]; events: Record<string, unknown>[] } | null {
  const d = getDb();
  const entity = d.prepare('SELECT * FROM entities WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined;
  if (!entity) return null;

  const relations = d
    .prepare(
      `SELECT r.*, e1.name as from_name, e2.name as to_name
       FROM relations r
       LEFT JOIN entities e1 ON r.from_entity_id = e1.id
       LEFT JOIN entities e2 ON r.to_entity_id = e2.id
       WHERE r.from_entity_id = ? OR r.to_entity_id = ?
       ORDER BY r.strength DESC LIMIT 50`,
    )
    .all(id, id) as Record<string, unknown>[];

  const events = d
    .prepare(
      `SELECT * FROM events WHERE entity_ids LIKE ?
       ORDER BY timestamp DESC LIMIT 10`,
    )
    .all(`%${id}%`) as Record<string, unknown>[];

  return { entity, relations, events };
}

// ─── Relation Queries ───────────────────────────────────────────────────

interface ListRelationsOpts extends PaginationOpts {
  readonly type?: string;
}

export function listRelations(
  opts: ListRelationsOpts = {},
): PaginatedResult<Record<string, unknown>> {
  const d = getDb();
  const { offset = 0, limit = DEFAULT_LIMIT, type } = opts;

  const whereType = type ? ' WHERE r.type = ?' : '';
  const countParams: unknown[] = type ? [type] : [];
  const countRow = d
    .prepare(`SELECT COUNT(*) as total FROM relations r${whereType}`)
    .get(...countParams);
  const total = isCountRow(countRow) ? countRow.total : 0;

  const queryParams: unknown[] = type ? [type, limit, offset] : [limit, offset];
  const rows = d
    .prepare(
      `SELECT r.*, e1.name as from_name, e2.name as to_name
       FROM relations r
       LEFT JOIN entities e1 ON r.from_entity_id = e1.id
       LEFT JOIN entities e2 ON r.to_entity_id = e2.id
       ${whereType}
       ORDER BY r.strength DESC LIMIT ? OFFSET ?`,
    )
    .all(...queryParams) as Record<string, unknown>[];

  return { rows, total };
}

// ─── Observation Queries ────────────────────────────────────────────────

interface ListObservationsOpts extends PaginationOpts {
  readonly type?: string;
  readonly search?: string;
}

export function listObservations(
  opts: ListObservationsOpts = {},
): PaginatedResult<Record<string, unknown>> {
  const d = getDb();
  const { offset = 0, limit = DEFAULT_LIMIT, type, search } = opts;

  if (search) {
    const ftsQuery = sanitizeFtsQuery(search);
    if (!ftsQuery) return { rows: [], total: 0 };

    const whereType = type ? ' AND o.type = ?' : '';
    const countParams: unknown[] = [ftsQuery];
    const queryParams: unknown[] = [ftsQuery];
    if (type) {
      countParams.push(type);
      queryParams.push(type);
    }

    const countRow = d
      .prepare(
        `SELECT COUNT(*) as total FROM observations o
         INNER JOIN observations_fts fts ON o.rowid = fts.rowid
         WHERE observations_fts MATCH ?${whereType}`,
      )
      .get(...countParams);
    const total = isCountRow(countRow) ? countRow.total : 0;

    queryParams.push(limit, offset);
    const rows = d
      .prepare(
        `SELECT o.* FROM observations o
         INNER JOIN observations_fts fts ON o.rowid = fts.rowid
         WHERE observations_fts MATCH ?${whereType}
         ORDER BY fts.rank LIMIT ? OFFSET ?`,
      )
      .all(...queryParams) as Record<string, unknown>[];

    return { rows, total };
  }

  const whereType = type ? ' WHERE type = ?' : '';
  const countParams: unknown[] = type ? [type] : [];
  const countRow = d
    .prepare(`SELECT COUNT(*) as total FROM observations${whereType}`)
    .get(...countParams);
  const total = isCountRow(countRow) ? countRow.total : 0;

  const queryParams: unknown[] = type ? [type, limit, offset] : [limit, offset];
  const rows = d
    .prepare(
      `SELECT * FROM observations${whereType} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    )
    .all(...queryParams) as Record<string, unknown>[];

  return { rows, total };
}

// ─── Event Queries ──────────────────────────────────────────────────────

interface ListEventsOpts extends PaginationOpts {
  readonly source?: string;
}

export function listEvents(opts: ListEventsOpts = {}): PaginatedResult<Record<string, unknown>> {
  const d = getDb();
  const { offset = 0, limit = DEFAULT_LIMIT, source } = opts;

  const whereSource = source ? ' WHERE source = ?' : '';
  const countParams: unknown[] = source ? [source] : [];
  const countRow = d
    .prepare(`SELECT COUNT(*) as total FROM events${whereSource}`)
    .get(...countParams);
  const total = isCountRow(countRow) ? countRow.total : 0;

  const queryParams: unknown[] = source ? [source, limit, offset] : [limit, offset];
  const rows = d
    .prepare(`SELECT * FROM events${whereSource} ORDER BY timestamp DESC LIMIT ? OFFSET ?`)
    .all(...queryParams) as Record<string, unknown>[];

  return { rows, total };
}

// ─── Conversation Queries ───────────────────────────────────────────────

interface ListConversationsOpts extends PaginationOpts {
  readonly platform?: string;
}

export function listConversations(
  opts: ListConversationsOpts = {},
): PaginatedResult<Record<string, unknown>> {
  const d = getDb();
  const { offset = 0, limit = DEFAULT_LIMIT, platform } = opts;

  const wherePlatform = platform ? ' WHERE platform = ?' : '';
  const countParams: unknown[] = platform ? [platform] : [];
  const countRow = d
    .prepare(`SELECT COUNT(*) as total FROM agent_conversations${wherePlatform}`)
    .get(...countParams);
  const total = isCountRow(countRow) ? countRow.total : 0;

  const queryParams: unknown[] = platform ? [platform, limit, offset] : [limit, offset];
  const rows = d
    .prepare(
      `SELECT * FROM agent_conversations${wherePlatform}
       ORDER BY last_message_at DESC LIMIT ? OFFSET ?`,
    )
    .all(...queryParams) as Record<string, unknown>[];

  return { rows, total };
}

export function getConversationMessages(
  conversationId: string,
  opts: PaginationOpts = {},
): PaginatedResult<Record<string, unknown>> {
  const d = getDb();
  const { offset = 0, limit = DEFAULT_LIMIT } = opts;

  const countRow = d
    .prepare('SELECT COUNT(*) as total FROM agent_messages WHERE conversation_id = ?')
    .get(conversationId);
  const total = isCountRow(countRow) ? countRow.total : 0;

  const rows = d
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
}

export function listFacts(opts: ListFactsOpts = {}): PaginatedResult<Record<string, unknown>> {
  const d = getDb();
  const { offset = 0, limit = DEFAULT_LIMIT, nodeId, workspaceId } = opts;

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
  const where = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';

  const countRow = d
    .prepare(`SELECT COUNT(*) as total FROM agent_memory${where}`)
    .get(...params);
  const total = isCountRow(countRow) ? countRow.total : 0;

  const queryParams = [...params, limit, offset];
  const rows = d
    .prepare(`SELECT * FROM agent_memory${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(...queryParams) as Record<string, unknown>[];

  return { rows, total };
}

// ─── Stats ──────────────────────────────────────────────────────────────

export interface BrainStats {
  readonly entities: number;
  readonly relations: number;
  readonly events: number;
  readonly observations: number;
  readonly conversations: number;
  readonly messages: number;
  readonly facts: number;
}

export function getStats(): BrainStats {
  const d = getDb();
  const count = (table: string): number => {
    const row = d.prepare(`SELECT COUNT(*) as total FROM ${table}`).get();
    return isCountRow(row) ? row.total : 0;
  };

  return {
    entities: count('entities'),
    relations: count('relations'),
    events: count('events'),
    observations: count('observations'),
    conversations: count('agent_conversations'),
    messages: count('agent_messages'),
    facts: count('agent_memory'),
  };
}

// ─── Mutations (delegated to shared module pattern) ─────────────────────

export function deleteRow(table: string, id: string): boolean {
  const d = getDb();
  const ALLOWED_TABLES: Record<string, string> = {
    entities: 'DELETE FROM entities WHERE id = ?',
    relations: 'DELETE FROM relations WHERE id = ?',
    observations: 'DELETE FROM observations WHERE id = ?',
    events: 'DELETE FROM events WHERE id = ?',
    agent_memory: 'DELETE FROM agent_memory WHERE id = ?',
  };

  const sql = ALLOWED_TABLES[table];
  if (!sql) return false;

  const result = d.prepare(sql).run(id);
  return result.changes > 0;
}

export function deleteConversation(id: string): boolean {
  const d = getDb();
  const del = d.transaction(() => {
    d.prepare('DELETE FROM agent_messages WHERE conversation_id = ?').run(id);
    return d.prepare('DELETE FROM agent_conversations WHERE id = ?').run(id);
  });
  return del().changes > 0;
}

interface EntityUpdateFields {
  readonly name?: string;
  readonly summary?: string | null;
  readonly type?: string;
}

export function updateEntity(id: string, fields: EntityUpdateFields): boolean {
  const d = getDb();
  const sets: string[] = [];
  const values: unknown[] = [];

  if (fields.name !== undefined) {
    sets.push('name = ?');
    values.push(fields.name);
  }
  if (fields.summary !== undefined) {
    sets.push('summary = ?');
    values.push(fields.summary);
  }
  if (fields.type !== undefined) {
    sets.push('type = ?');
    values.push(fields.type);
  }

  if (sets.length === 0) return false;

  sets.push("last_updated_at = datetime('now')");
  values.push(id);

  const sql = `UPDATE entities SET ${sets.join(', ')} WHERE id = ?`;
  const result = d.prepare(sql).run(...values);
  return result.changes > 0;
}
