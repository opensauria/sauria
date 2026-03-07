import type BetterSqlite3 from 'better-sqlite3';
import { isCountRow, sanitizeFtsQuery, DEFAULT_LIMIT } from './brain-queries-shared.js';
import type { PaginationOpts, PaginatedResult } from './brain-queries-shared.js';

// ─── Entity Queries ─────────────────────────────────────────────────────

interface ListEntitiesOpts extends PaginationOpts {
  readonly type?: string;
  readonly search?: string;
}

export function listEntities(
  db: BetterSqlite3.Database,
  opts: ListEntitiesOpts = {},
): PaginatedResult<Record<string, unknown>> {
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

    const countRow = db
      .prepare(
        `SELECT COUNT(*) as total FROM entities e
         INNER JOIN entities_fts fts ON e.rowid = fts.rowid
         WHERE entities_fts MATCH ?${whereType}`,
      )
      .get(...countParams);
    const total = isCountRow(countRow) ? countRow.total : 0;

    queryParams.push(limit, offset);
    const rows = db
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
  const countRow = db
    .prepare(`SELECT COUNT(*) as total FROM entities${whereType}`)
    .get(...countParams);
  const total = isCountRow(countRow) ? countRow.total : 0;

  const queryParams: unknown[] = type ? [type, limit, offset] : [limit, offset];
  const rows = db
    .prepare(
      `SELECT * FROM entities${whereType} ORDER BY importance_score DESC, last_updated_at DESC LIMIT ? OFFSET ?`,
    )
    .all(...queryParams) as Record<string, unknown>[];

  return { rows, total };
}

export function getEntityDetail(
  db: BetterSqlite3.Database,
  id: string,
): {
  entity: Record<string, unknown>;
  relations: Record<string, unknown>[];
  events: Record<string, unknown>[];
} | null {
  const entity = db.prepare('SELECT * FROM entities WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined;
  if (!entity) return null;

  const relations = db
    .prepare(
      `SELECT r.*, e1.name as from_name, e2.name as to_name
       FROM relations r
       LEFT JOIN entities e1 ON r.from_entity_id = e1.id
       LEFT JOIN entities e2 ON r.to_entity_id = e2.id
       WHERE r.from_entity_id = ? OR r.to_entity_id = ?
       ORDER BY r.strength DESC LIMIT 50`,
    )
    .all(id, id) as Record<string, unknown>[];

  const events = db
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
  readonly search?: string;
}

export function listRelations(
  db: BetterSqlite3.Database,
  opts: ListRelationsOpts = {},
): PaginatedResult<Record<string, unknown>> {
  const { offset = 0, limit = DEFAULT_LIMIT, type, search } = opts;

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (type) {
    conditions.push('r.type = ?');
    params.push(type);
  }
  if (search) {
    const like = `%${search}%`;
    conditions.push('(e1.name LIKE ? OR e2.name LIKE ? OR r.type LIKE ?)');
    params.push(like, like, like);
  }

  const where = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';

  const countRow = db
    .prepare(
      `SELECT COUNT(*) as total FROM relations r
       LEFT JOIN entities e1 ON r.from_entity_id = e1.id
       LEFT JOIN entities e2 ON r.to_entity_id = e2.id${where}`,
    )
    .get(...params);
  const total = isCountRow(countRow) ? countRow.total : 0;

  const queryParams = [...params, limit, offset];
  const rows = db
    .prepare(
      `SELECT r.*, e1.name as from_name, e2.name as to_name
       FROM relations r
       LEFT JOIN entities e1 ON r.from_entity_id = e1.id
       LEFT JOIN entities e2 ON r.to_entity_id = e2.id${where}
       ORDER BY r.strength DESC LIMIT ? OFFSET ?`,
    )
    .all(...queryParams) as Record<string, unknown>[];

  return { rows, total };
}

