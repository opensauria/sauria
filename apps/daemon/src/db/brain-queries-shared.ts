import type BetterSqlite3 from 'better-sqlite3';

// ─── Type Guards ────────────────────────────────────────────────────────

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function isCountRow(value: unknown): value is { total: number } {
  return isRecord(value) && typeof value['total'] === 'number';
}

// ─── FTS5 Sanitization ─────────────────────────────────────────────────

const FTS5_SPECIAL = /[?"'*+\-(){}^:]/g;

export function sanitizeFtsQuery(raw: string): string {
  const cleaned = raw.replace(FTS5_SPECIAL, ' ').trim();
  const terms = cleaned.split(/\s+/).filter((t) => t.length > 0);
  if (terms.length === 0) return '';
  return terms.map((t) => `"${t}"`).join(' ');
}

// ─── Pagination ─────────────────────────────────────────────────────────

export interface PaginationOpts {
  readonly offset?: number;
  readonly limit?: number;
}

export interface PaginatedResult<T> {
  readonly rows: T[];
  readonly total: number;
}

export const DEFAULT_LIMIT = 50;

// ─── Stats ──────────────────────────────────────────────────────────────

export interface BrainStats {
  readonly entities: number;
  readonly relations: number;
  readonly events: number;
  readonly observations: number;
  readonly conversations: number;
  readonly messages: number;
  readonly facts: number;
  readonly extractionFailures: number;
}

export function getStats(db: BetterSqlite3.Database, extractionFailures = 0): BrainStats {
  const count = (table: string): number => {
    const row = db.prepare(`SELECT COUNT(*) as total FROM ${table}`).get();
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
    extractionFailures,
  };
}
