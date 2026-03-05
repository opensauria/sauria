import type BetterSqlite3 from 'better-sqlite3';
import { getLogger } from '../utils/logger.js';

interface Migration {
  readonly version: number;
  readonly description: string;
  readonly up: (db: BetterSqlite3.Database) => void;
}

const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    description: 'add deadline column to agent_tasks',
    up: (db) => {
      const columns = db
        .prepare(`PRAGMA table_info(agent_tasks)`)
        .all() as Array<{ name: string }>;
      const hasDeadline = columns.some((c) => c.name === 'deadline');
      if (!hasDeadline) {
        db.exec(`ALTER TABLE agent_tasks ADD COLUMN deadline TEXT`);
      }
    },
  },
];

export function runMigrations(db: BetterSqlite3.Database): void {
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
      migration.up(db);
      db.prepare('INSERT INTO migrations (version, description) VALUES (?, ?)').run(
        migration.version,
        migration.description,
      );
    });

    transaction();
    logger.info(`Migration v${migration.version} applied`);
  }
}
