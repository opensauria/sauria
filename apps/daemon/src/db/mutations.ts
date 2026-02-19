import type BetterSqlite3 from 'better-sqlite3';

export function deleteEntity(db: BetterSqlite3.Database, id: string): boolean {
  const result = db.prepare('DELETE FROM entities WHERE id = ?').run(id);
  return result.changes > 0;
}

export function deleteObservation(db: BetterSqlite3.Database, id: string): boolean {
  const result = db.prepare('DELETE FROM observations WHERE id = ?').run(id);
  return result.changes > 0;
}

export function deleteEvent(db: BetterSqlite3.Database, id: string): boolean {
  const result = db.prepare('DELETE FROM events WHERE id = ?').run(id);
  return result.changes > 0;
}

export function deleteRelation(db: BetterSqlite3.Database, id: string): boolean {
  const result = db.prepare('DELETE FROM relations WHERE id = ?').run(id);
  return result.changes > 0;
}

export function deleteConversation(db: BetterSqlite3.Database, id: string): boolean {
  const del = db.transaction(() => {
    db.prepare('DELETE FROM agent_messages WHERE conversation_id = ?').run(id);
    return db.prepare('DELETE FROM agent_conversations WHERE id = ?').run(id);
  });
  const result = del();
  return result.changes > 0;
}

export function deleteMessage(db: BetterSqlite3.Database, id: string): boolean {
  const del = db.transaction(() => {
    const row = db.prepare('SELECT conversation_id FROM agent_messages WHERE id = ?').get(id) as
      | { conversation_id: string }
      | undefined;
    const result = db.prepare('DELETE FROM agent_messages WHERE id = ?').run(id);
    if (result.changes > 0 && row) {
      db.prepare(
        'UPDATE agent_conversations SET message_count = message_count - 1 WHERE id = ?',
      ).run(row.conversation_id);
    }
    return result;
  });
  return del().changes > 0;
}

export function deleteFact(db: BetterSqlite3.Database, id: string): boolean {
  const result = db.prepare('DELETE FROM agent_memory WHERE id = ?').run(id);
  return result.changes > 0;
}

export interface EntityUpdate {
  readonly name?: string;
  readonly summary?: string | null;
  readonly type?: string;
}

export function updateEntity(
  db: BetterSqlite3.Database,
  id: string,
  fields: EntityUpdate,
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
