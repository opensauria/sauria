# OpenWind

Security-first persistent cognitive kernel. Ingests your digital life, builds a living knowledge graph, reasons proactively, and exposes your world model as an MCP server so any AI agent becomes 10x smarter.

Your world, always with you.

## What It Does

OpenWind runs as a background daemon on your machine. It connects to your email, calendar, and other data sources via MCP, extracts structured entities and relationships, and builds an encrypted knowledge graph. Every 15 minutes it reasons about your world: upcoming deadlines, decaying relationships, behavioral patterns, cross-source insights.

It exposes everything as an MCP server. Connect Claude Code, Cursor, or any MCP-compatible agent and they instantly know your world without asking you a single question.

```
User: "Follow up with Marc"

Agent calls openwind_get_entity("Marc") ->
  Marc Dupont, CTO at ClientX, last email 12 days ago,
  works_on: "API Migration" (stalled), usually responds in 2-3 days

Agent drafts a perfect, contextual follow-up.
```

## Install

```bash
# npm (all platforms)
npm install -g openwind && openwind onboard

# macOS / Linux
curl -fsSL https://openwind.dev/install.sh | bash

# Windows (PowerShell)
irm https://openwind.dev/install.ps1 | iex

# Docker
docker run -d --name openwind -v openwind-data:/data ghcr.io/openwind/openwind
```

Requires Node.js 22+.

## Quick Start

```bash
# 1. Interactive setup (choose AI provider, connect sources)
openwind onboard

# 2. Start the daemon
openwind daemon

# 3. Ask anything
openwind ask "Who is Marc?"

# 4. Check what's coming up
openwind upcoming

# 5. Add knowledge manually
openwind teach "Marc is CTO of ClientX"

# 6. Start MCP server for other agents
openwind mcp-server
```

## CLI Commands

| Command | Description |
|---------|-------------|
| `openwind onboard` | Interactive setup wizard |
| `openwind daemon` | Start background daemon |
| `openwind ask <question>` | Natural language query |
| `openwind interactive` | Interactive REPL mode |
| `openwind status` | System overview |
| `openwind focus <entity>` | Deep dive on an entity |
| `openwind entity <name>` | Look up entity details |
| `openwind upcoming [hours]` | Upcoming deadlines (default: 24h) |
| `openwind insights` | AI-generated observations |
| `openwind teach <fact>` | Add knowledge manually |
| `openwind sources` | List configured data sources |
| `openwind mcp-server` | Start MCP server (stdio) |
| `openwind doctor` | Run health checks |
| `openwind audit [count]` | Show audit log |
| `openwind export` | Encrypted backup |
| `openwind purge` | Secure delete all data |
| `openwind config` | Show current config |

## MCP Server Tools

When running as an MCP server, OpenWind exposes these tools to any connected agent:

| Tool | Description |
|------|-------------|
| `openwind_query` | Natural language question answered from knowledge graph |
| `openwind_get_entity` | Entity details + relations + timeline |
| `openwind_search` | Hybrid semantic + keyword search |
| `openwind_get_upcoming` | Deadlines, meetings in next N hours |
| `openwind_get_insights` | AI-generated observations and patterns |
| `openwind_get_context_for` | Full context dump for a topic |
| `openwind_add_event` | Feed an event into world model |

All inputs validated with Zod. Rate limited. Audit logged. Responses capped at 100KB.

## Configuration

Config lives at `~/.openwind/config.json5`:

```json5
{
  models: {
    extraction: { provider: "google", model: "gemini-2.5-flash" },
    reasoning: { provider: "anthropic", model: "claude-sonnet-4-5" },
    deep: { provider: "anthropic", model: "claude-opus-4-6" },
    embeddings: { provider: "local", model: "all-MiniLM-L6-v2" }
  },
  auth: {
    anthropic: { method: "encrypted_file" },
    google: { method: "encrypted_file" }
  },
  budget: {
    dailyLimitUsd: 5.00,
    warnAtUsd: 3.00
  }
}
```

Supported AI providers: Anthropic, OpenAI, Google Gemini, Ollama, OpenRouter, Mistral, Groq, Together, any OpenAI-compatible endpoint.

## Architecture

```
Data Sources (MCP Client)         Channels
  Gmail, Calendar, Notion  --->  Telegram Bot, CLI
         |                              ^
         v                              |
  +--------------+              +---------------+
  |  Ingestion   |              |   Reasoning   |
  |  Pipeline    |              |    Engine      |
  |  normalize   |              |  context build |
  |  dedup       |              |  LLM query     |
  |  extract     |              +---------------+
  |  resolve     |                      ^
  +--------------+                      |
         |                    +------------------+
         v                    | Proactive Engine |
  +--------------+            |  deadlines       |
  | World Model  | <--------> |  decay detection |
  |  SQLite      |            |  pattern analysis|
  |  encrypted   |            |  insights (5/day)|
  |  entities    |            +------------------+
  |  relations   |
  |  events      |           +------------------+
  |  observations|           |   MCP Server     |
  |  tasks       | --------> |   stdio          |
  +--------------+           |   7 tools        |
                             +------------------+
```

### Key Design Decisions

- **Brain, not hands.** OpenWind thinks but never acts. It reads emails (read-only scopes) but never sends them. Connect it to another agent via MCP for actions.
- **Any LLM.** Cheap models for extraction, balanced for reasoning, expensive for deep analysis. Swap providers without changing code.
- **Local embeddings.** Vector search runs entirely on-device via `@huggingface/transformers` (all-MiniLM-L6-v2). No embedding API calls.
- **Hybrid search.** FTS5 full-text + vector cosine similarity combined for best results.
- **Proactive.** Scans every 15 minutes. Max 5 alerts/day, 2h cooldown between similar alerts.

## Security

OpenWind is security-first. This is non-negotiable.

### The 12 Commandments

1. **Zero open ports.** All services use stdio or outbound-only HTTPS. Nothing listens.
2. **Zero plaintext secrets.** Credentials stored in AES-256-GCM encrypted vault (600 permissions).
3. **Zero trust on external input.** Every byte from channels, MCP, AI, and ingested content is sanitized and validated.
4. **Zero shell execution.** No `child_process`, no `exec()`, no `eval()`, no `Function()` anywhere in `src/`.
5. **Zero auto-connect to dynamic URLs.** All outbound URLs checked against a hardcoded allowlist.
6. **Zero data exfiltration.** AI calls include only extracted summaries, never raw emails.
7. **Zero elevated privileges.** Refuses to start as root.
8. **Zero bypass flags.** No `--dangerously-skip-permissions`, no YOLO mode.
9. **Zero remote access by default.** MCP server is stdio only.
10. **Zero plugins.** No third-party code execution. No dynamic loading.
11. **Zero raw content storage.** Database stores only structured extracts, never full documents.
12. **Zero silent failures.** Security errors cause hard stops, never swallowed.

### Defense in Depth

| Layer | What | How |
|-------|------|-----|
| Input sanitization | Strip LLM control tokens, null bytes, unicode normalization | `sanitize.ts` |
| Prompt injection | Content isolation, canary tokens, strict JSON parsing | `anti-injection.ts` |
| AI response validation | Zod schema on every response, entity name caps, no URL following | `extract.ts` |
| SQL injection | Parameterized queries only, zero string interpolation | `world-model.ts` |
| Filesystem | All operations restricted to `~/.openwind/` | `fs-sandbox.ts` |
| Network | Outbound-only, domain allowlist, 30s timeout | `url-allowlist.ts` |
| PII | Scrub SSN, credit card, phone, email, API keys before AI calls | `pii-scrubber.ts` |
| Rate limiting | Token bucket per subsystem (AI, ingestion, MCP, channels) | `rate-limiter.ts` |
| Budget | Hard daily USD cap on AI calls | `budget.ts` |
| Audit | Every action logged with SHA-256 hashes, never content | `audit.ts` |
| Encryption | SQLite database encrypted at rest | `crypto.ts` |
| Startup | Permission checks, ownership validation, Node version | `startup-checks.ts` |

### Data Protection

- **At rest:** Encrypted SQLite database. Master key derived via PBKDF2 (256,000 iterations, SHA-512). Config and DB files chmod 600.
- **In transit:** HTTPS only to allowlisted AI provider domains. Telegram via long-polling (no webhook ports). MCP via stdio.
- **In logs:** Prompts stored as SHA-256 hashes only. API keys never logged. Entity names redacted.
- **Exports:** AES-256-GCM encrypted with user-provided password.

## Project Structure

```
src/
  index.ts                    Entry point
  cli.ts                      Commander CLI
  cli-actions.ts              CLI command implementations
  daemon.ts                   Daemon start/stop
  daemon-lifecycle.ts         Full startup/shutdown sequence

  security/
    startup-checks.ts         Pre-launch security validation
    sanitize.ts               Input sanitization
    crypto.ts                 AES-256-GCM vault
    fs-sandbox.ts             Path traversal prevention
    url-allowlist.ts          Outbound domain restriction
    rate-limiter.ts           Token bucket rate limiting
    pii-scrubber.ts           PII removal before AI calls
    audit.ts                  Action audit logging
    banned-patterns.ts        Runtime banned code scanner
    os-sandbox.ts             OS-level process isolation

  config/
    schema.ts                 Zod config validation
    defaults.ts               Default configuration
    loader.ts                 Config file loading
    paths.ts                  Cross-platform path resolution

  db/
    connection.ts             Encrypted SQLite connection
    schema.ts                 Table definitions + FTS5
    types.ts                  Database row types
    world-model.ts            Entity/relation/event CRUD
    search.ts                 Hybrid FTS5 + vector search
    temporal.ts               Time-based queries

  ai/
    router.ts                 Multi-provider model routing
    extract.ts                Entity extraction pipeline
    reason.ts                 Context-aware reasoning
    anti-injection.ts         Canary tokens + response validation
    embeddings.ts             Local vector embeddings
    providers/
      base.ts                 LLM provider interface
      anthropic.ts            Anthropic Claude
      openai.ts               OpenAI + compatible APIs
      google.ts               Google Gemini
      ollama.ts               Ollama local models

  ingestion/
    pipeline.ts               Full ingestion orchestration
    normalizer.ts             Raw data normalization
    dedup.ts                  SHA-256 content deduplication
    resolver.ts               Entity resolution + merging
    sources/
      mcp.ts                  MCP client connector
      email.ts                Gmail via MCP
      calendar.ts             Google Calendar via MCP
      manual.ts               Manual knowledge input

  engine/
    proactive.ts              15-min proactive loop
    alert-converters.ts       Alert type conversions
    deadlines.ts              Deadline scanning
    relations.ts              Relationship decay detection
    patterns.ts               Behavioral pattern analysis
    insights.ts               Cross-source AI insights
    tasks.ts                  Task management

  mcp/
    server.ts                 MCP server (7 tools, stdio)
    server-helpers.ts         Response formatting
    tools.ts                  Tool definitions + Zod schemas
    client.ts                 MCP client manager

  channels/
    base.ts                   Channel interface
    telegram.ts               Telegram bot (grammY)
    cli-interactive.ts        Interactive REPL

  utils/
    logger.ts                 Structured logging + PII scrub
    budget.ts                 Daily AI spend tracking
    version.ts                Version from package.json

scripts/
  onboard.ts                  Interactive onboarding wizard
  install.sh                  macOS/Linux installer
  install.ps1                 Windows installer

.github/workflows/
  ci.yml                      Lint, test, security scan
  release.yml                 Tag-triggered npm publish

Dockerfile                    Multi-stage, non-root
docker-compose.yml            Security-hardened
SECURITY.md                   Responsible disclosure
```

## Development

```bash
# Install dependencies
npm install

# Type-check
npm run typecheck

# Run tests
npm test

# Run in development
npm run dev

# Build
npm run build

# Security lint (banned patterns)
npm run lint:security
```

## Docker

```bash
docker compose up -d
```

The Docker setup runs as non-root with a read-only root filesystem, all capabilities dropped, custom seccomp profile, and no port mappings.

## Cross-Platform Support

| Platform | Install | Daemon |
|----------|---------|--------|
| macOS (ARM/Intel) | curl / npm | launchd |
| Linux x86_64/ARM64 | curl / npm | systemd |
| Windows 10/11 | PowerShell / npm | Task Scheduler |
| Docker | docker compose | Container |

## Dependencies

All versions pinned. No `^` or `~`. Lock file committed.

| Package | Purpose |
|---------|---------|
| `better-sqlite3` | Encrypted SQLite database |
| `@modelcontextprotocol/sdk` | MCP client + server |
| `@anthropic-ai/sdk` | Anthropic Claude provider |
| `openai` | OpenAI + compatible providers |
| `@huggingface/transformers` | Local vector embeddings |
| `grammy` | Telegram bot (long-polling) |
| `commander` | CLI framework |
| `zod` | Schema validation |
| `nanoid` | ID generation |
| `json5` | Config file parsing |

## License

MIT
