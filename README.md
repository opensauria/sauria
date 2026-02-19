# OpenWind

Your AI knows nothing about you. OpenWind fixes that.

It runs locally on your machine, connects to your data sources, builds a knowledge graph of your world, and shares it with any AI agent through MCP. It also lets you deploy a team of AI agents (Telegram bots, Slack bots, etc.) that collaborate like a real company — receiving orders, delegating tasks, and exchanging information.

## What It Does

OpenWind is two things:

**1. A knowledge layer for AI.** It connects to your email, calendar, and tools via MCP, extracts entities and relationships, and builds an encrypted knowledge graph. Every 15 minutes it scans for deadlines, decaying relationships, and patterns. Any MCP-compatible AI client (Claude Desktop, Cursor, Windsurf) plugs in and instantly knows your context.

```
User: "Follow up with Marc"

Agent calls openwind_get_entity("Marc") ->
  Marc Dupont, CTO at ClientX, last email 12 days ago,
  works_on: "API Migration" (stalled), usually responds in 2-3 days

Agent drafts a perfect, contextual follow-up.
```

**2. A multi-agent orchestrator.** The desktop app provides a visual canvas where you place AI agents, draw connections between them, and define routing rules. Messages flow through a queue with owner priority, get routed by deterministic rules or LLM intelligence, and are filtered by autonomy levels before execution.

```
You send a message to your Telegram research bot
    |
    v
MessageQueue (owner priority) -> AgentOrchestrator
    |
    ├── Edge rule: "always forward to Slack analyst bot"
    ├── LLM routing: "this needs the marketing team"
    └── Autonomy filter: "agent needs approval for cross-team actions"
    |
    v
Messages dispatched to the right agents across platforms
```

## Install

```bash
# macOS / Linux
curl -fsSL https://openwind.ai/install.sh | bash

# Windows (PowerShell)
irm https://openwind.ai/install.ps1 | iex

# npm (manual)
npm install -g openwind && openwind onboard

# Docker
docker run -d --name openwind -v openwind-data:/data ghcr.io/openwind/openwind
```

Requires Node.js 24+.

The installer runs the setup wizard, stores credentials in an encrypted vault, configures your AI clients as MCP consumers, and starts the background daemon.

## Desktop App

The Electron desktop app provides:

- **Agent Canvas** — Infinite viewport where you place and connect AI agents visually. Drag agents from the dock, draw edges to define communication routes, create workspace frames to group teams.
- **Command Palette** — Quick access to all commands via `Cmd+Shift+O`.
- **Setup Wizard** — Guided configuration for API keys, providers, and MCP client registration.
- **Tray Icon** — Daemon status, quick actions, always running in background.

## CLI

```bash
openwind                    # Show status (or onboard if first run)
openwind ask "Who is Marc?" # Natural language query
openwind teach "Marc is CTO of ClientX"
openwind status             # System overview
openwind upcoming           # Deadlines in next 24h
openwind insights           # AI-generated observations
openwind doctor             # Health checks
```

| Command                     | Description                       |
| --------------------------- | --------------------------------- |
| `openwind onboard`          | Interactive setup wizard          |
| `openwind daemon`           | Start background daemon           |
| `openwind ask <question>`   | Natural language query            |
| `openwind interactive`      | Interactive REPL mode             |
| `openwind status`           | System overview                   |
| `openwind focus <entity>`   | Deep dive on an entity            |
| `openwind entity <name>`    | Look up entity details            |
| `openwind upcoming [hours]` | Upcoming deadlines (default: 24h) |
| `openwind insights`         | AI-generated observations         |
| `openwind teach <fact>`     | Add knowledge manually            |
| `openwind sources`          | List configured data sources      |
| `openwind mcp-server`       | Start MCP server (stdio)          |
| `openwind doctor`           | Run health checks                 |
| `openwind audit [count]`    | Show audit log                    |
| `openwind export`           | Encrypted backup                  |
| `openwind purge`            | Secure delete all data            |
| `openwind config`           | Show current config               |

## MCP Tools

When running as an MCP server, OpenWind exposes 7 tools to connected agents:

| Tool                       | Description                                             |
| -------------------------- | ------------------------------------------------------- |
| `openwind_query`           | Natural language question answered from knowledge graph |
| `openwind_get_entity`      | Entity details + relations + timeline                   |
| `openwind_search`          | Hybrid semantic + keyword search                        |
| `openwind_get_upcoming`    | Deadlines and meetings in next N hours                  |
| `openwind_get_insights`    | AI-generated observations and patterns                  |
| `openwind_get_context_for` | Full context dump for a topic                           |
| `openwind_add_event`       | Feed an event into the knowledge graph                  |

All inputs validated with Zod. Rate limited. Audit logged.

## Architecture

```
Data Sources (MCP)              Channels
  Gmail, Calendar,       ┌──── Telegram, Slack,
  Notion, Tools          │     WhatsApp, Discord, Email
         |               │            |
         v               │            v
  ┌──────────────┐       │     ┌──────────────┐
  │  Ingestion   │       │     │  Orchestrator │
  │  Pipeline    │       │     │  + MsgQueue   │
  │  normalize   │       │     │  edge rules   │
  │  dedup       │       │     │  LLM routing  │
  │  extract     │       │     │  autonomy     │
  └──────┬───────┘       │     └──────┬────────┘
         │               │            │
         v               │            v
  ┌──────────────┐       │     ┌──────────────┐
  │ Knowledge    │◄──────┘     │  Channel     │
  │ Graph        │             │  Registry    │
  │  SQLite      │             │  per-node    │
  │  encrypted   │             │  credentials │
  │  entities    │             └──────────────┘
  │  relations   │
  │  events      │      ┌──────────────┐
  │  tasks       │─────►│  MCP Server  │
  └──────────────┘      │  7 tools     │
         │              └──────────────┘
         v
  ┌──────────────┐
  │  Proactive   │
  │  Engine      │
  │  deadlines   │
  │  patterns    │
  │  insights    │
  └──────────────┘
```

### Design Decisions

- **Any LLM.** Cheap models for extraction, balanced for reasoning, expensive for deep analysis. Swap providers without changing code. Supports Anthropic, OpenAI, Google, Ollama, and any OpenAI-compatible endpoint.
- **Local embeddings.** Vector search runs entirely on-device (`all-MiniLM-L6-v2`). No embedding API calls.
- **Hybrid search.** FTS5 full-text + vector cosine similarity combined.
- **Local voice transcription.** Telegram voice messages transcribed on-device — MLX Whisper on macOS (Apple Silicon), faster-whisper on Linux/Windows. No cloud transcription API.
- **Multi-agent collaboration.** Each agent gets its own channel instance, vault credentials, and autonomy level. Forwarded messages are enriched with source conversation context. Workspace facts are shared across agents and injected into routing prompts.
- **Owner priority.** Messages from the owner skip the queue and get processed first.
- **Canvas as config.** The visual canvas is the source of truth for agent topology. The daemon reads `canvas.json` and rebuilds channels on changes.

## Configuration

Config lives at `~/.openwind/config.json5`:

```json5
{
  models: {
    extraction: { provider: 'google', model: 'gemini-2.5-flash' },
    reasoning: { provider: 'anthropic', model: 'claude-sonnet-4-5' },
    deep: { provider: 'anthropic', model: 'claude-opus-4-6' },
    embeddings: { provider: 'local', model: 'all-MiniLM-L6-v2' },
  },
  budget: { dailyLimitUsd: 5.0, warnAtUsd: 3.0 },
  ceo: {
    telegram: { userId: 123456789 },
  },
}
```

## Security

Security is not a feature, it's the foundation. Everything is built on top of it.

### Principles

1. **Zero open ports.** All services use stdio or outbound-only HTTPS.
2. **Zero plaintext secrets.** AES-256-GCM encrypted vault (PBKDF2, 256k iterations, SHA-512).
3. **Zero trust on input.** Every byte from channels, MCP, AI responses is sanitized and validated.
4. **Minimal shell execution.** Only `execFile` for voice transcription (sandboxed Python subprocess). No `exec()`, no `eval()`, no shell interpolation.
5. **Zero auto-connect.** Outbound URLs checked against a hardcoded allowlist.
6. **Zero data leaks.** AI calls receive extracted summaries, never raw documents.
7. **Zero elevated privileges.** Refuses to start as root.
8. **Zero raw storage.** Database stores structured extracts, never full documents.
9. **Zero silent failures.** Security errors cause hard stops.

### Layers

| Layer              | Implementation                                                    |
| ------------------ | ----------------------------------------------------------------- |
| Input sanitization | LLM control tokens, null bytes, unicode normalization stripped    |
| Prompt injection   | Content isolation, canary tokens, strict JSON parsing             |
| SQL injection      | Parameterized queries only, zero string interpolation             |
| Filesystem         | All operations restricted to `~/.openwind/`                       |
| Network            | Outbound-only, domain allowlist, 30s timeout                      |
| PII                | SSN, credit card, phone, email, API keys scrubbed before AI calls |
| Rate limiting      | Token bucket per subsystem (AI, ingestion, MCP, channels)         |
| Budget             | Hard daily USD cap on AI calls                                    |
| Audit              | Every action logged with SHA-256 hashes, never content            |
| Encryption         | SQLite database encrypted at rest, vault files chmod 600          |

## Development

```bash
npm install          # Install dependencies
npm run typecheck    # Type-check
npm test             # Run tests
npm run dev          # Run in development
npm run build        # Build for production
```

## Cross-Platform

| Platform           | Install          | Daemon         |
| ------------------ | ---------------- | -------------- |
| macOS (ARM/Intel)  | curl / npm       | launchd        |
| Linux x86_64/ARM64 | curl / npm       | systemd        |
| Windows 10/11      | PowerShell / npm | Task Scheduler |
| Docker             | docker compose   | Container      |

## License

MIT
