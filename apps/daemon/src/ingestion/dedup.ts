import { createHash } from 'node:crypto';
import type BetterSqlite3 from 'better-sqlite3';

export function contentHash(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

export function isDuplicate(db: BetterSqlite3.Database, hash: string): boolean {
  const row: unknown = db.prepare('SELECT 1 FROM events WHERE content_hash = ?').get(hash);
  return row !== undefined;
}
