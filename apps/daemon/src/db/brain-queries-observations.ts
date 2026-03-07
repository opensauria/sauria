import type BetterSqlite3 from 'better-sqlite3';
import { isCountRow, sanitizeFtsQuery, DEFAULT_LIMIT } from './brain-queries-shared.js';
import type { PaginationOpts, PaginatedResult } from './brain-queries-shared.js';

interface ListObservationsOpts extends PaginationOpts {
  readonly type?: string;
  readonly search?: string;
}

export function listObservations(
  db: BetterSqlite3.Database,
  opts: ListObservationsOpts = {},
): PaginatedResult<Record<string, unknown>> {
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

    const countRow = db
      .prepare(
        `SELECT COUNT(*) as total FROM observations o
         INNER JOIN observations_fts fts ON o.rowid = fts.rowid
         WHERE observations_fts MATCH ?${whereType}`,
      )
      .get(...countParams);
    const total = isCountRow(countRow) ? countRow.total : 0;

    queryParams.push(limit, offset);
    const rows = db
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
  const countRow = db
    .prepare(`SELECT COUNT(*) as total FROM observations${whereType}`)
    .get(...countParams);
  const total = isCountRow(countRow) ? countRow.total : 0;

  const queryParams: unknown[] = type ? [type, limit, offset] : [limit, offset];
  const rows = db
    .prepare(`SELECT * FROM observations${whereType} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(...queryParams) as Record<string, unknown>[];

  return { rows, total };
}
