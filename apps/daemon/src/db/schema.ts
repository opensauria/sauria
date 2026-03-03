import type BetterSqlite3 from 'better-sqlite3';

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS entities (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK (type IN ('person','project','company','event','document','goal','place','concept')),
    name TEXT NOT NULL,
    summary TEXT,
    properties JSON,
    importance_score REAL DEFAULT 0.5,
    first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_mentioned_at TEXT,
    mention_count INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS relations (
    id TEXT PRIMARY KEY,
    from_entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    to_entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    strength REAL DEFAULT 0.5,
    context TEXT,
    first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (from_entity_id, to_entity_id, type)
  );

  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    event_type TEXT NOT NULL,
    content_hash TEXT UNIQUE,
    parsed_data JSON,
    entity_ids JSON,
    timestamp TEXT NOT NULL,
    processed_at TEXT DEFAULT (datetime('now')),
    importance REAL DEFAULT 0.5
  );

  CREATE TABLE IF NOT EXISTS observations (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK (type IN ('pattern','insight','prediction','preference','fact')),
    content TEXT NOT NULL,
    confidence REAL DEFAULT 0.5,
    source_event_ids JSON,
    entity_ids JSON,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    validated_at TEXT,
    expires_at TEXT
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','completed','cancelled','blocked')),
    priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('critical','high','medium','low')),
    entity_ids JSON,
    scheduled_for TEXT,
    completed_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS embeddings (
    entity_id TEXT PRIMARY KEY REFERENCES entities(id) ON DELETE CASCADE,
    vector BLOB NOT NULL,
    model TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(type);
  CREATE INDEX IF NOT EXISTS idx_entities_name ON entities(name);
  CREATE INDEX IF NOT EXISTS idx_entities_importance ON entities(importance_score DESC);
  CREATE INDEX IF NOT EXISTS idx_entities_last_mentioned ON entities(last_mentioned_at DESC);

  CREATE INDEX IF NOT EXISTS idx_relations_from ON relations(from_entity_id);
  CREATE INDEX IF NOT EXISTS idx_relations_to ON relations(to_entity_id);
  CREATE INDEX IF NOT EXISTS idx_relations_type ON relations(type);

  CREATE INDEX IF NOT EXISTS idx_events_source ON events(source);
  CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp DESC);
  CREATE INDEX IF NOT EXISTS idx_events_content_hash ON events(content_hash);

  CREATE INDEX IF NOT EXISTS idx_observations_type ON observations(type);
  CREATE INDEX IF NOT EXISTS idx_observations_created ON observations(created_at DESC);

  CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
  CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
  CREATE INDEX IF NOT EXISTS idx_tasks_scheduled ON tasks(scheduled_for);

  CREATE TABLE IF NOT EXISTS agent_messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    source_node_id TEXT NOT NULL,
    sender_id TEXT NOT NULL,
    sender_is_ceo INTEGER NOT NULL DEFAULT 0,
    platform TEXT NOT NULL,
    group_id TEXT,
    content TEXT NOT NULL,
    content_type TEXT NOT NULL DEFAULT 'text',
    routing_decision JSON,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS agent_conversations (
    id TEXT PRIMARY KEY,
    workspace_id TEXT,
    platform TEXT NOT NULL,
    group_id TEXT,
    participant_node_ids JSON NOT NULL DEFAULT '[]',
    last_message_at TEXT NOT NULL DEFAULT (datetime('now')),
    message_count INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS agent_tasks (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    assigned_to TEXT NOT NULL,
    delegated_by TEXT,
    title TEXT NOT NULL,
    description TEXT,
    priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','critical')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','completed','cancelled')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT,
    deadline TEXT
  );

  CREATE TABLE IF NOT EXISTS agent_memory (
    id TEXT PRIMARY KEY,
    node_id TEXT NOT NULL,
    workspace_id TEXT,
    fact TEXT NOT NULL,
    topics JSON NOT NULL DEFAULT '[]',
    source TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_agent_messages_conversation ON agent_messages(conversation_id);
  CREATE INDEX IF NOT EXISTS idx_agent_messages_source_node ON agent_messages(source_node_id);
  CREATE INDEX IF NOT EXISTS idx_agent_messages_created ON agent_messages(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_agent_conversations_workspace ON agent_conversations(workspace_id);
  CREATE INDEX IF NOT EXISTS idx_agent_tasks_workspace ON agent_tasks(workspace_id);
  CREATE INDEX IF NOT EXISTS idx_agent_tasks_assigned ON agent_tasks(assigned_to);
  CREATE INDEX IF NOT EXISTS idx_agent_tasks_status ON agent_tasks(status);
  CREATE INDEX IF NOT EXISTS idx_agent_memory_node ON agent_memory(node_id);
  CREATE INDEX IF NOT EXISTS idx_agent_memory_workspace ON agent_memory(workspace_id);

  CREATE VIRTUAL TABLE IF NOT EXISTS entities_fts USING fts5(name, summary, content=entities, content_rowid=rowid);

  CREATE VIRTUAL TABLE IF NOT EXISTS observations_fts USING fts5(content, content=observations, content_rowid=rowid);
`;

const TRIGGERS_SQL = `
  CREATE TRIGGER IF NOT EXISTS entities_ai AFTER INSERT ON entities BEGIN
    INSERT INTO entities_fts(rowid, name, summary) VALUES (new.rowid, new.name, new.summary);
  END;

  CREATE TRIGGER IF NOT EXISTS entities_ad AFTER DELETE ON entities BEGIN
    INSERT INTO entities_fts(entities_fts, rowid, name, summary) VALUES ('delete', old.rowid, old.name, old.summary);
  END;

  CREATE TRIGGER IF NOT EXISTS entities_au AFTER UPDATE ON entities BEGIN
    INSERT INTO entities_fts(entities_fts, rowid, name, summary) VALUES ('delete', old.rowid, old.name, old.summary);
    INSERT INTO entities_fts(rowid, name, summary) VALUES (new.rowid, new.name, new.summary);
  END;

  CREATE TRIGGER IF NOT EXISTS observations_ai AFTER INSERT ON observations BEGIN
    INSERT INTO observations_fts(rowid, content) VALUES (new.rowid, new.content);
  END;

  CREATE TRIGGER IF NOT EXISTS observations_ad AFTER DELETE ON observations BEGIN
    INSERT INTO observations_fts(observations_fts, rowid, content) VALUES ('delete', old.rowid, old.content);
  END;

  CREATE TRIGGER IF NOT EXISTS observations_au AFTER UPDATE ON observations BEGIN
    INSERT INTO observations_fts(observations_fts, rowid, content) VALUES ('delete', old.rowid, old.content);
    INSERT INTO observations_fts(rowid, content) VALUES (new.rowid, new.content);
  END;
`;

const MIGRATIONS_SQL = `
  -- Add deadline column to agent_tasks (idempotent for existing DBs)
  CREATE TABLE IF NOT EXISTS _migrations (id TEXT PRIMARY KEY);
  INSERT OR IGNORE INTO _migrations (id) VALUES ('add_agent_tasks_deadline');
`;

function runMigrations(db: BetterSqlite3.Database): void {
  db.exec(MIGRATIONS_SQL);

  const hasMigration = db
    .prepare("SELECT id FROM _migrations WHERE id = 'add_agent_tasks_deadline'")
    .get();

  if (hasMigration) {
    const columns = db.pragma('table_info(agent_tasks)') as Array<{ name: string }>;
    const hasDeadline = columns.some((c) => c.name === 'deadline');
    if (!hasDeadline) {
      db.exec('ALTER TABLE agent_tasks ADD COLUMN deadline TEXT');
    }
    db.exec(
      'CREATE INDEX IF NOT EXISTS idx_agent_tasks_deadline ON agent_tasks(status, deadline)',
    );
  }
}

export function applySchema(db: BetterSqlite3.Database): void {
  db.exec(SCHEMA_SQL);
  db.exec(TRIGGERS_SQL);
  runMigrations(db);
}
