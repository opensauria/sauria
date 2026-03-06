# Sauria

Your AI knows nothing about you. Sauria fixes that.

It's a personal AI operating system that runs locally, connects to your data sources, builds a knowledge graph of your world, and shares it with any AI agent through MCP. It also lets you deploy a team of AI agents across messaging platforms that collaborate like a real company — receiving orders, delegating tasks, and exchanging information.

## What It Does

**1. A knowledge layer for AI.** It connects to your email, calendar, and tools via MCP, extracts entities and relationships, and builds an encrypted knowledge graph. It continuously scans for deadlines, decaying relationships, and patterns. Any MCP-compatible AI client (Claude Desktop, Cursor, Windsurf) plugs in and instantly knows your context.

```
User: "Follow up with Marc"

Agent calls sauria_get_entity("Marc") ->
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
curl -fsSL https://sauria.ai/install.sh | bash

# Windows (PowerShell)
irm https://sauria.ai/install.ps1 | iex

# npm (manual)
npm install -g sauria && sauria onboard

# Docker
docker run -d --name sauria -v sauria-data:/data ghcr.io/sauria/sauria
```

Requires Node.js 24+.

The installer runs the setup wizard, stores credentials in an encrypted vault, configures your AI clients as MCP consumers, and starts the background daemon.

## Desktop App

The desktop app provides:

- **Squad** — Infinite viewport where you place and connect AI agents visually. Drag agents from the dock, draw edges to define communication routes, create workspace frames to group teams.
- **Command Palette** — Quick access to all commands via `Cmd+Shift+O`.
- **Setup Wizard** — Guided configuration for API keys, providers, and MCP client registration.
- **Tray Icon** — Daemon status, quick actions, always running in background.

## CLI

```bash
sauria                    # Show status (or onboard if first run)
sauria ask "Who is Marc?" # Natural language query
sauria teach "Marc is CTO of ClientX"
sauria status             # System overview
sauria upcoming           # Deadlines in next 24h
sauria insights           # AI-generated observations
sauria doctor             # Health checks
```

| Command                     | Description                       |
| --------------------------- | --------------------------------- |
| `sauria onboard`          | Interactive setup wizard          |
| `sauria daemon`           | Start background daemon           |
| `sauria ask <question>`   | Natural language query            |
| `sauria interactive`      | Interactive REPL mode             |
| `sauria status`           | System overview                   |
| `sauria focus <entity>`   | Deep dive on an entity            |
| `sauria entity <name>`    | Look up entity details            |
| `sauria upcoming [hours]` | Upcoming deadlines (default: 24h) |
| `sauria insights`         | AI-generated observations         |
| `sauria teach <fact>`     | Add knowledge manually            |
| `sauria sources`          | List configured data sources      |
| `sauria mcp-server`       | Start MCP server (stdio)          |
| `sauria doctor`           | Run health checks                 |
| `sauria audit [count]`    | Show audit log                    |
| `sauria export`           | Encrypted backup                  |
| `sauria purge`            | Secure delete all data            |
| `sauria config`           | Show current config               |

## MCP Tools

When running as an MCP server, Sauria exposes 7 tools to connected agents:

| Tool                       | Description                                             |
| -------------------------- | ------------------------------------------------------- |
| `sauria_query`           | Natural language question answered from knowledge graph |
| `sauria_get_entity`      | Entity details + relations + timeline                   |
| `sauria_search`          | Hybrid semantic + keyword search                        |
| `sauria_get_upcoming`    | Deadlines and meetings in next N hours                  |
| `sauria_get_insights`    | AI-generated observations and patterns                  |
| `sauria_get_context_for` | Full context dump for a topic                           |
| `sauria_add_event`       | Feed an event into the knowledge graph                  |

All inputs validated. Rate limited. Audit logged.

## Configuration

Config lives at `~/.sauria/config.json5`:

```json5
{
  models: {
    extraction: { provider: 'google', model: 'gemini-2.5-flash' },
    reasoning: { provider: 'anthropic', model: 'claude-sonnet-4-5' },
    deep: { provider: 'anthropic', model: 'claude-opus-4-6' },
  },
  budget: { dailyLimitUsd: 5.0, warnAtUsd: 3.0 },
  ceo: {
    telegram: { userId: 123456789 },
  },
}
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
