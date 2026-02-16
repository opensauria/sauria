export type EntityType =
  | 'person'
  | 'project'
  | 'company'
  | 'event'
  | 'document'
  | 'goal'
  | 'place'
  | 'concept';

export type ObservationType = 'pattern' | 'insight' | 'prediction' | 'preference' | 'fact';

export interface Entity {
  id: string;
  type: EntityType;
  name: string;
  summary: string | null;
  properties: Record<string, string> | null;
  importanceScore: number;
  firstSeenAt: string;
  lastUpdatedAt: string;
  lastMentionedAt: string | null;
  mentionCount: number;
}

export interface Relation {
  id: string;
  fromEntityId: string;
  toEntityId: string;
  type: string;
  strength: number;
  context: string | null;
  firstSeenAt: string;
  lastUpdatedAt: string;
}

export interface Event {
  id: string;
  source: string;
  eventType: string;
  contentHash: string | null;
  parsedData: Record<string, unknown> | null;
  entityIds: string[] | null;
  timestamp: string;
  processedAt: string | null;
  importance: number;
}

export interface Observation {
  id: string;
  type: ObservationType;
  content: string;
  confidence: number;
  sourceEventIds: string[] | null;
  entityIds: string[] | null;
  createdAt: string;
  validatedAt: string | null;
  expiresAt: string | null;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  entityIds: string[] | null;
  scheduledFor: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface EntityRow {
  id: string;
  type: string;
  name: string;
  summary: string | null;
  properties: string | null;
  importance_score: number;
  first_seen_at: string;
  last_updated_at: string;
  last_mentioned_at: string | null;
  mention_count: number;
}

export interface RelationRow {
  id: string;
  from_entity_id: string;
  to_entity_id: string;
  type: string;
  strength: number;
  context: string | null;
  first_seen_at: string;
  last_updated_at: string;
}

export interface EventRow {
  id: string;
  source: string;
  event_type: string;
  content_hash: string | null;
  parsed_data: string | null;
  entity_ids: string | null;
  timestamp: string;
  processed_at: string | null;
  importance: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function isEntityRow(value: unknown): value is EntityRow {
  if (!isRecord(value)) return false;
  return (
    typeof value['id'] === 'string' &&
    typeof value['name'] === 'string' &&
    typeof value['type'] === 'string'
  );
}

export function isRelationRow(value: unknown): value is RelationRow {
  if (!isRecord(value)) return false;
  return typeof value['id'] === 'string' && typeof value['from_entity_id'] === 'string';
}

export function isEventRow(value: unknown): value is EventRow {
  if (!isRecord(value)) return false;
  return typeof value['id'] === 'string' && typeof value['source'] === 'string';
}

function parseJsonField<T>(raw: string | null): T | null {
  if (raw === null) return null;
  return JSON.parse(raw) as T;
}

export function toEntity(row: EntityRow): Entity {
  return {
    id: row.id,
    type: row.type as EntityType,
    name: row.name,
    summary: row.summary,
    properties: parseJsonField<Record<string, string>>(row.properties),
    importanceScore: row.importance_score,
    firstSeenAt: row.first_seen_at,
    lastUpdatedAt: row.last_updated_at,
    lastMentionedAt: row.last_mentioned_at,
    mentionCount: row.mention_count,
  };
}

export function toRelation(row: RelationRow): Relation {
  return {
    id: row.id,
    fromEntityId: row.from_entity_id,
    toEntityId: row.to_entity_id,
    type: row.type,
    strength: row.strength,
    context: row.context,
    firstSeenAt: row.first_seen_at,
    lastUpdatedAt: row.last_updated_at,
  };
}

export function toEvent(row: EventRow): Event {
  return {
    id: row.id,
    source: row.source,
    eventType: row.event_type,
    contentHash: row.content_hash,
    parsedData: parseJsonField<Record<string, unknown>>(row.parsed_data),
    entityIds: parseJsonField<string[]>(row.entity_ids),
    timestamp: row.timestamp,
    processedAt: row.processed_at,
    importance: row.importance,
  };
}
