import Database from 'better-sqlite3';
import { applySchema } from '../../db/schema.js';

export function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  applySchema(db);
  return db;
}
