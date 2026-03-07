import Database from 'better-sqlite3';
import type BetterSqlite3 from 'better-sqlite3';
import { paths } from '../config/paths.js';

export function openDatabase(): BetterSqlite3.Database {
  const db = new Database(paths.db);

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('page_size = 4096');
  db.pragma('busy_timeout = 30000');
  db.pragma('synchronous = NORMAL');
  db.pragma('optimize');

  return db;
}

export function closeDatabase(db: BetterSqlite3.Database): void {
  db.close();
}
