import type BetterSqlite3 from 'better-sqlite3';

// ─── Mutations ──────────────────────────────────────────────────────────

const ALLOWED_DELETE_TABLES: Record<string, string> = {
  entities: 'DELETE FROM entities WHERE id = ?',
  relations: 'DELETE FROM relations WHERE id = ?',
  observations: 'DELETE FROM observations WHERE id = ?',
  events: 'DELETE FROM events WHERE id = ?',
  agent_memory: 'DELETE FROM agent_memory WHERE id = ?',
};

export function deleteRow(db: BetterSqlite3.Database, table: string, id: string): boolean {
  const sql = ALLOWED_DELETE_TABLES[table];
  if (!sql) return false;
  const result = db.prepare(sql).run(id);
  return result.changes > 0;
}

export function deleteConversation(db: BetterSqlite3.Database, id: string): boolean {
  const del = db.transaction(() => {
    db.prepare('DELETE FROM agent_messages WHERE conversation_id = ?').run(id);
    return db.prepare('DELETE FROM agent_conversations WHERE id = ?').run(id);
  });
  return del().changes > 0;
}

interface EntityUpdateFields {
  readonly name?: string;
  readonly summary?: string | null;
  readonly type?: string;
}

export function updateEntity(
  db: BetterSqlite3.Database,
  id: string,
  fields: EntityUpdateFields,
): boolean {
  const sets: string[] = [];
  const values: unknown[] = [];

  if (fields.name !== undefined) {
    sets.push('name = ?');
    values.push(fields.name);
  }
  if (fields.summary !== undefined) {
    sets.push('summary = ?');
    values.push(fields.summary);
  }
  if (fields.type !== undefined) {
    sets.push('type = ?');
    values.push(fields.type);
  }

  if (sets.length === 0) return false;

  sets.push("last_updated_at = datetime('now')");
  values.push(id);

  const sql = `UPDATE entities SET ${sets.join(', ')} WHERE id = ?`;
  const result = db.prepare(sql).run(...values);
  return result.changes > 0;
}
