import type BetterSqlite3 from 'better-sqlite3';
import { isEntityRow, toEntity } from './types.js';
import type { Entity } from './types.js';

const DEFAULT_LIMIT = 20;

const FTS5_SPECIAL = /[?"'*+\-(){}^:]/g;

function sanitizeFtsQuery(raw: string): string {
  const cleaned = raw.replace(FTS5_SPECIAL, ' ').trim();
  const terms = cleaned.split(/\s+/).filter((t) => t.length > 0);
  if (terms.length === 0) return '';
  return terms.map((t) => `"${t}"`).join(' ');
}

interface EmbeddingRow {
  entity_id: string;
  vector: Buffer;
  model: string;
}

interface FtsRankRow {
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
  rank: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isEmbeddingRow(value: unknown): value is EmbeddingRow {
  if (!isRecord(value)) return false;
  return (
    typeof value['entity_id'] === 'string' &&
    Buffer.isBuffer(value['vector']) &&
    typeof value['model'] === 'string'
  );
}

function isFtsRankRow(value: unknown): value is FtsRankRow {
  if (!isRecord(value)) return false;
  return (
    typeof value['id'] === 'string' &&
    typeof value['name'] === 'string' &&
    typeof value['type'] === 'string' &&
    typeof value['rank'] === 'number'
  );
}

function bufferToFloat32Array(buffer: Buffer): Float32Array {
  const ab = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  return new Float32Array(ab);
}

function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const valA = a[i] ?? 0;
    const valB = b[i] ?? 0;
    dot += valA * valB;
    normA += valA * valA;
    normB += valB * valB;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  return dot / denom;
}

function fetchEntitiesOrdered(db: BetterSqlite3.Database, ids: string[]): Entity[] {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(',');
  const rows: unknown[] = db
    .prepare(`SELECT * FROM entities WHERE id IN (${placeholders})`)
    .all(...ids);
  const entityMap = new Map<string, Entity>();
  for (const row of rows) {
    if (!isEntityRow(row)) continue;
    entityMap.set(row.id, toEntity(row));
  }
  const results: Entity[] = [];
  for (const id of ids) {
    const entity = entityMap.get(id);
    if (entity) results.push(entity);
  }
  return results;
}

function scoreEmbeddings(
  db: BetterSqlite3.Database,
  queryVector: Float32Array,
): Map<string, number> {
  const rows: unknown[] = db.prepare('SELECT entity_id, vector, model FROM embeddings').all();
  const result = new Map<string, number>();
  for (const row of rows) {
    if (!isEmbeddingRow(row)) continue;
    const stored = bufferToFloat32Array(row.vector);
    result.set(row.entity_id, cosineSimilarity(queryVector, stored));
  }
  return result;
}

const FTS_SQL = `
  SELECT e.*, fts.rank FROM entities e
  INNER JOIN entities_fts fts ON e.rowid = fts.rowid
  WHERE entities_fts MATCH ? ORDER BY fts.rank LIMIT ?
`;

export function searchByKeyword(
  db: BetterSqlite3.Database,
  query: string,
  limit = DEFAULT_LIMIT,
): Entity[] {
  const ftsQuery = sanitizeFtsQuery(query);
  if (!ftsQuery) return [];
  const rows: unknown[] = db.prepare(FTS_SQL).all(ftsQuery, limit);
  return rows.filter(isEntityRow).map(toEntity);
}

export function searchByVector(
  db: BetterSqlite3.Database,
  queryVector: Float32Array,
  limit = DEFAULT_LIMIT,
): Entity[] {
  const similarities = scoreEmbeddings(db, queryVector);
  const sorted = Array.from(similarities.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => id);
  return fetchEntitiesOrdered(db, sorted);
}

export function hybridSearch(
  db: BetterSqlite3.Database,
  query: string,
  queryVector: Float32Array | null,
  limit = DEFAULT_LIMIT,
): Entity[] {
  const scores = new Map<string, { fts: number; vector: number }>();
  const ftsQuery = sanitizeFtsQuery(query);
  const ftsRows = ftsQuery
    ? (db.prepare(FTS_SQL).all(ftsQuery, limit * 2) as unknown[])
    : [];
  const rankedFts = ftsRows.filter(isFtsRankRow);

  let minRank = 0;
  let maxRank = 0;
  for (const row of rankedFts) {
    if (row.rank < minRank) minRank = row.rank;
    if (row.rank > maxRank) maxRank = row.rank;
  }
  const rankRange = maxRank - minRank;

  for (const row of rankedFts) {
    const normalized = rankRange === 0 ? 1 : 1 - (row.rank - minRank) / rankRange;
    scores.set(row.id, { fts: normalized, vector: 0 });
  }

  if (queryVector) {
    const similarities = scoreEmbeddings(db, queryVector);
    for (const [entityId, similarity] of similarities) {
      const existing = scores.get(entityId);
      if (existing) {
        existing.vector = similarity;
      } else {
        scores.set(entityId, { fts: 0, vector: similarity });
      }
    }
  }

  const combined = Array.from(scores.entries())
    .map(([id, s]) => ({ id, score: 0.5 * s.fts + 0.5 * s.vector }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((c) => c.id);

  return fetchEntitiesOrdered(db, combined);
}

export function storeEmbedding(
  db: BetterSqlite3.Database,
  entityId: string,
  vector: Float32Array,
  model: string,
): void {
  const buffer = Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength);
  db.prepare(
    `
    INSERT OR REPLACE INTO embeddings (entity_id, vector, model, updated_at)
    VALUES (?, ?, ?, datetime('now'))
  `,
  ).run(entityId, buffer, model);
}
