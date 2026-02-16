import type BetterSqlite3 from 'better-sqlite3';
import {
  isEntityRow,
  isRelationRow,
  isEventRow,
  toEntity,
  toRelation,
  toEvent,
} from './types.js';
import type {
  Entity,
  EntityType,
  Event,
  ObservationType,
  Relation,
} from './types.js';

export type {
  Entity,
  EntityType,
  Event,
  Observation,
  ObservationType,
  Relation,
  Task,
} from './types.js';

export function upsertEntity(
  db: BetterSqlite3.Database,
  entity: {
    id: string;
    type: EntityType;
    name: string;
    summary?: string;
    properties?: Record<string, string>;
    importanceScore?: number;
  },
): void {
  const now = new Date().toISOString();
  const props = entity.properties ? JSON.stringify(entity.properties) : null;

  db.prepare(`
    INSERT INTO entities (id, type, name, summary, properties, importance_score,
      first_seen_at, last_updated_at, last_mentioned_at, mention_count)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      summary = COALESCE(excluded.summary, entities.summary),
      properties = COALESCE(excluded.properties, entities.properties),
      importance_score = COALESCE(excluded.importance_score, entities.importance_score),
      last_updated_at = excluded.last_updated_at,
      last_mentioned_at = excluded.last_mentioned_at,
      mention_count = entities.mention_count + 1
  `).run(
    entity.id, entity.type, entity.name, entity.summary ?? null,
    props, entity.importanceScore ?? 0.5, now, now, now,
  );
}

export function upsertRelation(
  db: BetterSqlite3.Database,
  relation: {
    id: string;
    fromEntityId: string;
    toEntityId: string;
    type: string;
    strength?: number;
    context?: string;
  },
): void {
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO relations (id, from_entity_id, to_entity_id, type, strength,
      context, first_seen_at, last_updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(from_entity_id, to_entity_id, type) DO UPDATE SET
      strength = excluded.strength,
      context = COALESCE(excluded.context, relations.context),
      last_updated_at = excluded.last_updated_at
  `).run(
    relation.id, relation.fromEntityId, relation.toEntityId,
    relation.type, relation.strength ?? 0.5, relation.context ?? null, now, now,
  );
}

export function recordEvent(
  db: BetterSqlite3.Database,
  event: {
    id: string;
    source: string;
    eventType: string;
    contentHash: string;
    parsedData?: Record<string, unknown>;
    entityIds?: string[];
    timestamp: string;
    importance?: number;
  },
): void {
  db.prepare(`
    INSERT OR IGNORE INTO events (id, source, event_type, content_hash,
      parsed_data, entity_ids, timestamp, importance)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    event.id, event.source, event.eventType, event.contentHash,
    event.parsedData ? JSON.stringify(event.parsedData) : null,
    event.entityIds ? JSON.stringify(event.entityIds) : null,
    event.timestamp, event.importance ?? 0.5,
  );
}

export function addObservation(
  db: BetterSqlite3.Database,
  obs: {
    id: string;
    type: ObservationType;
    content: string;
    confidence?: number;
    sourceEventIds?: string[];
    entityIds?: string[];
  },
): void {
  db.prepare(`
    INSERT INTO observations (id, type, content, confidence,
      source_event_ids, entity_ids)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    obs.id, obs.type, obs.content, obs.confidence ?? 0.5,
    obs.sourceEventIds ? JSON.stringify(obs.sourceEventIds) : null,
    obs.entityIds ? JSON.stringify(obs.entityIds) : null,
  );
}

export function getEntity(
  db: BetterSqlite3.Database,
  id: string,
): Entity | undefined {
  const row: unknown = db.prepare(
    'SELECT * FROM entities WHERE id = ?',
  ).get(id);
  if (!isEntityRow(row)) return undefined;
  return toEntity(row);
}

export function getEntityByName(
  db: BetterSqlite3.Database,
  name: string,
): Entity | undefined {
  const row: unknown = db.prepare(
    'SELECT * FROM entities WHERE name = ?',
  ).get(name);
  if (!isEntityRow(row)) return undefined;
  return toEntity(row);
}

export function getEntityRelations(
  db: BetterSqlite3.Database,
  entityId: string,
): Relation[] {
  const rows: unknown[] = db.prepare(
    'SELECT * FROM relations WHERE from_entity_id = ? OR to_entity_id = ?',
  ).all(entityId, entityId);
  return rows.filter(isRelationRow).map(toRelation);
}

export function getEntityTimeline(
  db: BetterSqlite3.Database,
  entityId: string,
  limit = 50,
): Event[] {
  const rows: unknown[] = db.prepare(`
    SELECT e.* FROM events e, json_each(e.entity_ids) j
    WHERE j.value = ?
    ORDER BY e.timestamp DESC
    LIMIT ?
  `).all(entityId, limit);
  return rows.filter(isEventRow).map(toEvent);
}

export function searchEntities(
  db: BetterSqlite3.Database,
  query: string,
): Entity[] {
  const rows: unknown[] = db.prepare(`
    SELECT e.* FROM entities e
    INNER JOIN entities_fts fts ON e.rowid = fts.rowid
    WHERE entities_fts MATCH ?
    ORDER BY rank
    LIMIT 50
  `).all(query);
  return rows.filter(isEntityRow).map(toEntity);
}
