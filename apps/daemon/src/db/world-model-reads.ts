import type BetterSqlite3 from 'better-sqlite3';
import { isEntityRow, isRelationRow, isEventRow, toEntity, toRelation, toEvent } from './types.js';
import type { Entity, Event, Relation } from './types.js';
import { sanitizeFtsQuery } from './search.js';

export function getEntity(db: BetterSqlite3.Database, id: string): Entity | undefined {
  const row: unknown = db.prepare('SELECT * FROM entities WHERE id = ?').get(id);
  if (!isEntityRow(row)) return undefined;
  return toEntity(row);
}

export function getEntityByName(db: BetterSqlite3.Database, name: string): Entity | undefined {
  const row: unknown = db.prepare('SELECT * FROM entities WHERE name = ?').get(name);
  if (!isEntityRow(row)) return undefined;
  return toEntity(row);
}

export function getEntityRelations(db: BetterSqlite3.Database, entityId: string): Relation[] {
  const rows: unknown[] = db
    .prepare('SELECT * FROM relations WHERE from_entity_id = ? OR to_entity_id = ?')
    .all(entityId, entityId);
  return rows.filter(isRelationRow).map(toRelation);
}

export function getEntityTimeline(
  db: BetterSqlite3.Database,
  entityId: string,
  limit = 50,
): Event[] {
  const rows: unknown[] = db
    .prepare(
      `
    SELECT e.* FROM events e, json_each(e.entity_ids) j
    WHERE j.value = ?
    ORDER BY e.timestamp DESC
    LIMIT ?
  `,
    )
    .all(entityId, limit);
  return rows.filter(isEventRow).map(toEvent);
}

export function searchEntities(db: BetterSqlite3.Database, query: string): Entity[] {
  const ftsQuery = sanitizeFtsQuery(query);
  if (!ftsQuery) return [];
  const rows: unknown[] = db
    .prepare(
      `
    SELECT e.* FROM entities e
    INNER JOIN entities_fts fts ON e.rowid = fts.rowid
    WHERE entities_fts MATCH ?
    ORDER BY rank
    LIMIT 50
  `,
    )
    .all(ftsQuery);
  return rows.filter(isEntityRow).map(toEntity);
}
