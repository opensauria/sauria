import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { applySchema } from '../schema.js';

describe('schema', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  const EXPECTED_TABLES = [
    'entities',
    'relations',
    'events',
    'observations',
    'tasks',
    'embeddings',
    'agent_messages',
    'agent_conversations',
    'agent_tasks',
    'agent_memory',
  ];

  it('creates all expected tables', () => {
    applySchema(db);

    const rows = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all() as Array<{ name: string }>;
    const tableNames = rows.map((r) => r.name);

    for (const table of EXPECTED_TABLES) {
      expect(tableNames).toContain(table);
    }
  });

  it('creates entities_fts virtual table', () => {
    applySchema(db);

    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='entities_fts'")
      .get();
    expect(row).toBeTruthy();
  });

  it('creates observations_fts virtual table', () => {
    applySchema(db);

    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='observations_fts'")
      .get();
    expect(row).toBeTruthy();
  });

  it('is idempotent — applying schema twice does not error', () => {
    applySchema(db);
    expect(() => applySchema(db)).not.toThrow();
  });

  it('creates FTS triggers for entities', () => {
    applySchema(db);

    const triggers = db
      .prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'entities_a%'")
      .all() as Array<{ name: string }>;
    const triggerNames = triggers.map((t) => t.name);

    expect(triggerNames).toContain('entities_ai');
    expect(triggerNames).toContain('entities_ad');
    expect(triggerNames).toContain('entities_au');
  });

  it('creates FTS triggers for observations', () => {
    applySchema(db);

    const triggers = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'observations_a%'",
      )
      .all() as Array<{ name: string }>;
    const triggerNames = triggers.map((t) => t.name);

    expect(triggerNames).toContain('observations_ai');
    expect(triggerNames).toContain('observations_ad');
    expect(triggerNames).toContain('observations_au');
  });

  it('enforces entity type CHECK constraint', () => {
    applySchema(db);

    expect(() => {
      db.prepare(
        "INSERT INTO entities (id, type, name, first_seen_at, last_updated_at) VALUES ('x', 'invalid_type', 'Test', datetime('now'), datetime('now'))",
      ).run();
    }).toThrow();
  });
});
