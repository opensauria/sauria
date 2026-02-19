import { nanoid } from 'nanoid';
import type BetterSqlite3 from 'better-sqlite3';
import type { EntityType } from '../db/types.js';
import { getEntityByName, searchEntities } from '../db/world-model.js';

interface ExtractedEntityInput {
  readonly name: string;
  readonly type: EntityType;
  readonly properties?: Record<string, string>;
}

export function mergeProperties(
  existing: Record<string, string> | null,
  incoming: Record<string, string> | undefined,
): Record<string, string> {
  if (existing === null && incoming === undefined) {
    return {};
  }

  if (existing === null) {
    return { ...incoming };
  }

  if (incoming === undefined) {
    return { ...existing };
  }

  return { ...existing, ...incoming };
}

function computeNameSimilarity(a: string, b: string): number {
  const normalizedA = a.toLowerCase().trim();
  const normalizedB = b.toLowerCase().trim();

  if (normalizedA === normalizedB) {
    return 1.0;
  }

  if (normalizedA.includes(normalizedB) || normalizedB.includes(normalizedA)) {
    const shorter = Math.min(normalizedA.length, normalizedB.length);
    const longer = Math.max(normalizedA.length, normalizedB.length);
    return shorter / longer;
  }

  return 0;
}

const SIMILARITY_THRESHOLD = 0.7;

export function resolveEntity(db: BetterSqlite3.Database, extracted: ExtractedEntityInput): string {
  const exactMatch = getEntityByName(db, extracted.name);
  if (exactMatch) {
    return exactMatch.id;
  }

  const searchResults = searchEntities(db, extracted.name);

  for (const candidate of searchResults) {
    if (candidate.type !== extracted.type) {
      continue;
    }

    const similarity = computeNameSimilarity(candidate.name, extracted.name);
    if (similarity < SIMILARITY_THRESHOLD) {
      continue;
    }

    return candidate.id;
  }

  return nanoid();
}
