import type BetterSqlite3 from 'better-sqlite3';
import { isEntityRow, toEntity } from './types.js';
import type { Entity } from './types.js';

interface EmbeddingRow {
  entity_id: string;
  vector: Buffer;
  model: string;
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

function bufferToFloat32Array(buffer: Buffer): Float32Array {
  const ab = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  return new Float32Array(ab);
}

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
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

export function fetchEntitiesOrdered(db: BetterSqlite3.Database, ids: string[]): Entity[] {
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

export function scoreEmbeddings(
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
