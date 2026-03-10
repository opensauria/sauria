import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { tmpdir } from 'node:os';
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { applySchema } from '../schema.js';

vi.mock('../../utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

describe('runMigrations', () => {
  let db: Database.Database;
  let dataDir: string;
  let runMigrations: typeof import('../migrations.js').runMigrations;

  beforeEach(async () => {
    db = new Database(':memory:');
    applySchema(db);
    dataDir = mkdtempSync(join(tmpdir(), 'sauria-migration-test-'));
    const mod = await import('../migrations.js');
    runMigrations = mod.runMigrations;
  });

  afterEach(() => {
    db.close();
  });

  it('creates migrations table if not exists', () => {
    runMigrations(db, dataDir);

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='migrations'")
      .all() as Array<{ name: string }>;
    expect(tables).toHaveLength(1);
  });

  it('applies migration v1 — adds deadline column to agent_tasks', () => {
    runMigrations(db, dataDir);

    const columns = db.prepare('PRAGMA table_info(agent_tasks)').all() as Array<{ name: string }>;
    const hasDeadline = columns.some((c) => c.name === 'deadline');
    expect(hasDeadline).toBe(true);
  });

  it('skips migration v1 if deadline column already exists', () => {
    runMigrations(db, dataDir);
    expect(() => runMigrations(db, dataDir)).not.toThrow();

    const applied = db.prepare('SELECT version FROM migrations').all() as Array<{
      version: number;
    }>;
    expect(applied.find((r) => r.version === 1)).toBeDefined();
  });

  it('records applied migrations in the migrations table', () => {
    runMigrations(db, dataDir);

    const applied = db.prepare('SELECT version, description FROM migrations').all() as Array<{
      version: number;
      description: string;
    }>;
    expect(applied.length).toBeGreaterThan(0);
    expect(applied[0]?.description).toBeDefined();
  });

  it('does not re-apply already applied migrations', () => {
    runMigrations(db, dataDir);
    const countBefore = (db.prepare('SELECT COUNT(*) as c FROM migrations').get() as { c: number })
      .c;

    runMigrations(db, dataDir);
    const countAfter = (db.prepare('SELECT COUNT(*) as c FROM migrations').get() as { c: number })
      .c;

    expect(countAfter).toBe(countBefore);
  });

  it('migration v2 processes sidecar file with node ID mappings', () => {
    db.prepare(
      "INSERT INTO agent_messages (id, conversation_id, source_node_id, sender_id, sender_is_ceo, platform, content, content_type, created_at) VALUES ('m1', 'c1', 'old-id', 's1', 0, 'telegram', 'hello', 'text', datetime('now'))",
    ).run();

    db.prepare(
      "INSERT INTO agent_tasks (id, workspace_id, assigned_to, title, status, created_at) VALUES ('t1', 'ws1', 'old-id', 'task1', 'pending', datetime('now'))",
    ).run();

    db.prepare(
      "INSERT INTO agent_memory (id, node_id, fact, created_at) VALUES ('mem1', 'old-id', 'test fact', datetime('now'))",
    ).run();

    const sidecarPath = join(dataDir, 'node-id-migrations.json');
    writeFileSync(sidecarPath, JSON.stringify({ 'old-id': 'new-id' }), 'utf-8');

    runMigrations(db, dataDir);

    const msg = db.prepare('SELECT source_node_id FROM agent_messages WHERE id = ?').get('m1') as {
      source_node_id: string;
    };
    expect(msg.source_node_id).toBe('new-id');

    const task = db.prepare('SELECT assigned_to FROM agent_tasks WHERE id = ?').get('t1') as {
      assigned_to: string;
    };
    expect(task.assigned_to).toBe('new-id');

    const mem = db.prepare('SELECT node_id FROM agent_memory WHERE id = ?').get('mem1') as {
      node_id: string;
    };
    expect(mem.node_id).toBe('new-id');

    expect(existsSync(sidecarPath)).toBe(false);
  });

  it('migration v2 skips when sidecar file does not exist', () => {
    expect(() => runMigrations(db, dataDir)).not.toThrow();
  });

  it('migration v2 skips when sidecar is malformed JSON', () => {
    const sidecarPath = join(dataDir, 'node-id-migrations.json');
    writeFileSync(sidecarPath, 'not json', 'utf-8');

    expect(() => runMigrations(db, dataDir)).not.toThrow();
  });

  it('migration v2 skips when sidecar has empty mappings', () => {
    const sidecarPath = join(dataDir, 'node-id-migrations.json');
    writeFileSync(sidecarPath, JSON.stringify({}), 'utf-8');

    expect(() => runMigrations(db, dataDir)).not.toThrow();
  });

  it('migration v2 updates participant_node_ids in conversations', () => {
    db.prepare(
      "INSERT INTO agent_conversations (id, platform, group_id, participant_node_ids, last_message_at) VALUES ('conv1', 'telegram', NULL, ?, datetime('now'))",
    ).run(JSON.stringify(['old-id', 'other-node']));

    const sidecarPath = join(dataDir, 'node-id-migrations.json');
    writeFileSync(sidecarPath, JSON.stringify({ 'old-id': 'new-id' }), 'utf-8');

    runMigrations(db, dataDir);

    const conv = db
      .prepare('SELECT participant_node_ids FROM agent_conversations WHERE id = ?')
      .get('conv1') as { participant_node_ids: string };
    const participants = JSON.parse(conv.participant_node_ids) as string[];
    expect(participants).toContain('new-id');
    expect(participants).toContain('other-node');
    expect(participants).not.toContain('old-id');
  });

  it('migration v2 handles malformed JSON in participant_node_ids', () => {
    db.prepare(
      "INSERT INTO agent_conversations (id, platform, group_id, participant_node_ids, last_message_at) VALUES ('conv2', 'telegram', NULL, 'bad-json', datetime('now'))",
    ).run();

    const sidecarPath = join(dataDir, 'node-id-migrations.json');
    writeFileSync(sidecarPath, JSON.stringify({ 'old-id': 'new-id' }), 'utf-8');

    expect(() => runMigrations(db, dataDir)).not.toThrow();
  });
});
