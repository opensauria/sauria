import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import type BetterSqlite3 from 'better-sqlite3';
import { getLogger } from '../utils/logger.js';

interface Migration {
  readonly version: number;
  readonly description: string;
  readonly up: (db: BetterSqlite3.Database, dataDir: string) => void;
}

const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    description: 'add deadline column to agent_tasks',
    up: (db) => {
      const columns = db.prepare(`PRAGMA table_info(agent_tasks)`).all() as Array<{ name: string }>;
      const hasDeadline = columns.some((c) => c.name === 'deadline');
      if (!hasDeadline) {
        db.exec(`ALTER TABLE agent_tasks ADD COLUMN deadline TEXT`);
      }
    },
  },
  {
    version: 2,
    description: 'migrate node IDs to deterministic format',
    up: (db, dataDir) => {
      const sidecarPath = join(dataDir, 'node-id-migrations.json');
      if (!existsSync(sidecarPath)) return;

      let mappings: Record<string, string>;
      try {
        mappings = JSON.parse(readFileSync(sidecarPath, 'utf-8')) as Record<string, string>;
      } catch {
        return;
      }

      const entries = Object.entries(mappings);
      if (entries.length === 0) return;

      const logger = getLogger();

      for (const [oldId, newId] of entries) {
        logger.info(`Migrating node ID: ${oldId} -> ${newId}`);

        db.prepare('UPDATE agent_messages SET source_node_id = ? WHERE source_node_id = ?').run(
          newId,
          oldId,
        );
        db.prepare('UPDATE agent_tasks SET assigned_to = ? WHERE assigned_to = ?').run(
          newId,
          oldId,
        );
        db.prepare('UPDATE agent_tasks SET delegated_by = ? WHERE delegated_by = ?').run(
          newId,
          oldId,
        );
        db.prepare('UPDATE agent_memory SET node_id = ? WHERE node_id = ?').run(newId, oldId);

        // Migrate participant_node_ids in conversations (JSON array)
        const conversations = db
          .prepare('SELECT id, participant_node_ids FROM agent_conversations')
          .all() as Array<{ id: string; participant_node_ids: string }>;

        for (const conv of conversations) {
          try {
            const participants = JSON.parse(conv.participant_node_ids) as string[];
            const idx = participants.indexOf(oldId);
            if (idx >= 0) {
              participants[idx] = newId;
              db.prepare(
                'UPDATE agent_conversations SET participant_node_ids = ? WHERE id = ?',
              ).run(JSON.stringify(participants), conv.id);
            }
          } catch {
            // skip malformed JSON
          }
        }
      }

      // Delete sidecar after successful migration
      try {
        unlinkSync(sidecarPath);
      } catch {
        // best-effort
      }
    },
  },
];

export function runMigrations(db: BetterSqlite3.Database, dataDir: string): void {
  const logger = getLogger();

  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      version INTEGER PRIMARY KEY,
      description TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const applied = new Set(
    (db.prepare('SELECT version FROM migrations').all() as Array<{ version: number }>).map(
      (r) => r.version,
    ),
  );

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) continue;

    logger.info(`Applying migration v${migration.version}: ${migration.description}`);

    const transaction = db.transaction(() => {
      migration.up(db, dataDir);
      db.prepare('INSERT INTO migrations (version, description) VALUES (?, ?)').run(
        migration.version,
        migration.description,
      );
    });

    transaction();
    logger.info(`Migration v${migration.version} applied`);
  }
}
