import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { contentHash, isDuplicate } from '../dedup.js';
import { applySchema } from '../../db/schema.js';

function createTestDb(): InstanceType<typeof Database> {
  const db = new Database(':memory:');
  applySchema(db);
  return db;
}

describe('contentHash', () => {
  it('returns a 64-character hex SHA-256 hash', () => {
    const hash = contentHash('hello world');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic for the same input', () => {
    const first = contentHash('deterministic input');
    const second = contentHash('deterministic input');
    expect(first).toBe(second);
  });

  it('produces different hashes for different content', () => {
    const hashA = contentHash('content A');
    const hashB = contentHash('content B');
    expect(hashA).not.toBe(hashB);
  });

  it('handles empty string', () => {
    const hash = contentHash('');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('handles unicode content', () => {
    const hash = contentHash('\u{1F600} emoji \u{1F4A9}');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toBe(contentHash('emoji'));
  });
});

describe('isDuplicate', () => {
  it('returns false when hash does not exist in events table', () => {
    const db = createTestDb();
    expect(isDuplicate(db, 'nonexistent_hash')).toBe(false);
    db.close();
  });

  it('returns true when hash exists in events table', () => {
    const db = createTestDb();
    const hash = contentHash('duplicate content');
    db.prepare(
      "INSERT INTO events (id, source, event_type, content_hash, timestamp) VALUES (?, ?, ?, ?, datetime('now'))",
    ).run('evt-1', 'test', 'message', hash);

    expect(isDuplicate(db, hash)).toBe(true);
    db.close();
  });

  it('returns false after event with that hash is deleted', () => {
    const db = createTestDb();
    const hash = contentHash('temporary content');
    db.prepare(
      "INSERT INTO events (id, source, event_type, content_hash, timestamp) VALUES (?, ?, ?, ?, datetime('now'))",
    ).run('evt-2', 'test', 'message', hash);

    expect(isDuplicate(db, hash)).toBe(true);

    db.prepare('DELETE FROM events WHERE id = ?').run('evt-2');
    expect(isDuplicate(db, hash)).toBe(false);
    db.close();
  });
});
