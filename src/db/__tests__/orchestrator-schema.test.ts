import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { applySchema } from '../schema.js';

describe('orchestrator schema', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    applySchema(db);
  });

  afterEach(() => {
    db.close();
  });

  it('creates agent_messages table', () => {
    const info = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='agent_messages'").get();
    expect(info).toBeTruthy();
  });

  it('creates agent_conversations table', () => {
    const info = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='agent_conversations'").get();
    expect(info).toBeTruthy();
  });

  it('creates agent_tasks table', () => {
    const info = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='agent_tasks'").get();
    expect(info).toBeTruthy();
  });

  it('creates agent_memory table', () => {
    const info = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='agent_memory'").get();
    expect(info).toBeTruthy();
  });

  it('inserts and retrieves an agent message', () => {
    db.prepare(`INSERT INTO agent_messages (id, conversation_id, source_node_id, sender_id, sender_is_ceo, platform, content, content_type)
      VALUES ('m1', 'c1', 'node1', 'user1', 1, 'telegram', 'hello', 'text')`).run();
    const row = db.prepare('SELECT * FROM agent_messages WHERE id = ?').get('m1') as Record<string, unknown>;
    expect(row['content']).toBe('hello');
    expect(row['sender_is_ceo']).toBe(1);
  });

  it('inserts and retrieves an agent task', () => {
    db.prepare(`INSERT INTO agent_tasks (id, workspace_id, assigned_to, title, priority, status)
      VALUES ('t1', 'ws1', 'node1', 'Fix billing', 'high', 'pending')`).run();
    const row = db.prepare('SELECT * FROM agent_tasks WHERE id = ?').get('t1') as Record<string, unknown>;
    expect(row['title']).toBe('Fix billing');
  });
});
