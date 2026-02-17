# OpenWind — Project Rules

## What is OpenWind

OpenWind is a security-first personal AI operating system. It runs as a local daemon that ingests information from multiple sources (MCP servers, email, calendars), builds a persistent knowledge graph (entities, relations, events), and exposes it through channels (Telegram, Slack, WhatsApp, Discord, Email) and an MCP server.

The desktop app (Electron) provides a visual canvas where users connect AI agents, draw edges between them, and orchestrate multi-agent workflows. The user is the "CEO" who gives orders; agents collaborate through the orchestrator.

## Architecture

```
CLI (commander) ──► daemon-lifecycle.ts ──► ProactiveEngine
                                         ├── ModelRouter (multi-provider)
                                         ├── IngestPipeline
                                         ├── MCP Server (7 tools)
                                         ├── Orchestrator + MessageQueue
                                         │    ├── LLMRoutingBrain
                                         │    ├── AutonomyEnforcer
                                         │    └── ChannelRegistry
                                         └── Channels (Telegram, Slack, WhatsApp)

Desktop (Electron) ──► Canvas UI (agent cards, edges, workspaces)
                     ├── Setup Wizard
                     ├── Command Palette
                     └── IPC ──► vault, config, daemon management
```

## Tech Stack

- **Runtime**: Node.js 22+, ESM only
- **Language**: TypeScript strict mode (`verbatimModuleSyntax`, `noUncheckedIndexedAccess`)
- **Database**: SQLite via `better-sqlite3` (encrypted at rest)
- **AI Providers**: Anthropic, OpenAI, Google, Ollama (local)
- **Desktop**: Electron + Electron Forge (no framework, vanilla HTML/CSS/JS)
- **Build**: `tsdown` for CLI bundle, `tsc` for desktop
- **Test**: Vitest
- **Validation**: Zod schemas

## Project Structure

```
src/
  ai/              # Multi-provider router, extraction, reasoning
  auth/            # OAuth PKCE, API key validation, onboarding
  channels/        # Telegram, Slack, WhatsApp, base interface, registry
  config/          # Zod schema, loader, paths
  db/              # SQLite schema, world-model queries, search
  engine/          # Proactive alerts, deadlines, pattern detection
  ingestion/       # Pipeline, normalizer, dedup, MCP/email/calendar sources
  mcp/             # MCP server (7 tools), MCP client manager
  orchestrator/    # Orchestrator, LLM router, autonomy, message queue, types
  security/        # Vault, crypto, audit, rate limiter, PII scrubber, sanitize
  setup/           # Silent setup, daemon service, MCP client detection
  utils/           # Logger, budget tracker, version
  cli.ts           # Commander CLI entry point
  daemon.ts        # Daemon process entry point
  daemon-lifecycle.ts  # Start/stop daemon context (main integration file)

desktop/
  src/
    main.ts            # Electron main process, IPC handlers, vault
    preload.ts         # Context bridge
    window-canvas.ts   # Canvas window factory
    window-palette.ts  # Command palette window
    window-setup.ts    # Setup wizard window
    ui/
      canvas.html      # Agent canvas (inline JS, spring physics)
      canvas.css       # Canvas styles
      palette.html     # Command palette UI
      setup.html       # Setup wizard UI
      shared.css       # Design tokens and shared components
      icons/           # Brand + UI icons (copied by build script)
  scripts/
    copy-icons.js      # Icon build pipeline
```

## Key Conventions

### TypeScript
- Strict mode, no `any`, no `as` casting unless unavoidable
- All imports use `.js` extension (ESM)
- `readonly` on all interface properties and constructor deps
- `type` imports for type-only references (`import type { ... }`)
- Prefer early returns over nested conditionals
- Max 200 lines per file

### Naming
- Files: `kebab-case.ts`
- Classes: `PascalCase`
- Functions/variables: `camelCase`
- Constants: `SCREAMING_SNAKE_CASE`
- Booleans: `is/has/should/can` prefix
- Event handlers: `handle` prefix

### Error Handling
- Never swallow errors silently
- Audit logger for all channel and security events
- `{ success: false }` pattern in audit for failures
- Rate limiters on all inbound channels

### Security
- All user input goes through `sanitizeChannelInput()` before processing
- Vault secrets encrypted with AES-256-GCM, PBKDF2 key derivation
- URL allowlist for external fetches (`secureFetch`)
- PII scrubber before logging
- Rate limiting on every channel (per-minute caps)
- No secrets in code, all from vault

### Database
- SQLite with `better-sqlite3` (synchronous reads, async-wrapped writes)
- Schema applied on startup via `applySchema(db)`
- Tables: `entities`, `relations`, `events`, `observations`, `agent_messages`, `agent_conversations`, `agent_memory`, `agent_tasks`
- FTS5 for full-text search, vector embeddings for semantic search

### Channels
- All channels implement the `Channel` interface from `channels/base.ts`
- Each channel has: `start()`, `stop()`, `sendAlert()`, `sendMessage()`, `sendToGroup()`
- Channels with orchestrator integration have `onInbound` callback in deps
- Per-node vault keys: `channel_token_<nodeId>` alongside legacy global keys

### Orchestrator
- `CanvasGraph` (v2) is the source of truth: nodes, edges, workspaces
- Graph stored at `~/.openwind/canvas.json`, read by daemon on startup
- `MessageQueue` provides CEO priority (unshift) and backpressure
- `evaluateEdgeRules()` for deterministic routing, `LLMRoutingBrain` for intelligent routing
- `AutonomyEnforcer` filters actions based on agent autonomy level
- `ChannelRegistry` maps nodeId to channel instances

## Desktop UI Design

### Design Tokens (shared.css)
```
--bg: #1a1a1a          --surface: rgba(255,255,255,0.04)
--border: rgba(255,255,255,0.08)  --text: #ececec
--text-secondary: #999  --text-dim: #555
--accent: #7c6bf5       --accent-hover: #6854e0
--success: #34d399      --error: #f87171
--radius: 12px          --radius-sm: 8px
```

### Spacing
- 8px grid: all spacing multiples of 8 (8, 16, 24, 32, 40, 48...)
- 4px for micro-spacing (icon gaps, tight elements)
- 2px for borders only

### Corner Radius
- Outer radius = inner radius + padding
- Cards: 12px radius, inner elements: 8px
- Buttons: 8px radius
- Badges: 5px radius

### Typography
- System font stack: `-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif`
- Monospace: `Geist Mono` (canvas)
- Base: 14px, small: 11-12px, labels: 13px

### Canvas Specifics
- Dark theme only, glass morphism (`rgba` backgrounds with blur)
- Agent cards: 120px wide, portrait style with photo circle
- Spring physics animation (rAF-based, not CSS transitions)
- `cfCurrentIndex` (float) animates toward `cfActiveIndex` (int)
- SVG edges between nodes, updated on drag
- Workspace frames are colored rectangles with drag handles
- Dot grid background: 32px spacing

### Icons
- Brand icons: `simple-icons` npm package (telegram, discord, whatsapp, gmail)
- UI icons: `lucide-static` npm package (settings, zoom-in, zoom-out, etc.)
- Lucide icons need `filter: brightness(0) invert()` (stroke="currentColor" as img)
- Brand icons have baked-in fill colors

### Components
- `.btn` base + `.btn-primary` / `.btn-secondary` variants
- `.badge` + `.badge-accent` / `.badge-success` / `.badge-dim`
- `.spinner` for loading states (24px, accent border-top)
- Transitions: 0.15s ease for interactions

## Git Rules
- Conventional commits: `feat:`, `fix:`, `chore:`, `refactor:`, `docs:`
- Branch naming: `feat/description`, `fix/description`
- Never commit to main directly
- One logical change per commit
- Never add Co-Authored-By or any AI attribution to commits
- Commit message: imperative mood, max 72 chars subject, body if needed

## Daemon Lifecycle
- `startDaemonContext()` creates everything, returns `DaemonContext`
- `stopDaemonContext()` tears down in reverse order
- Canvas graph loaded on startup, file watcher reloads on change
- Legacy single-bot Telegram fallback when no canvas graph exists
- Orchestrator only created when canvas has connected nodes

## Electron Build
- `assets/icon.icns` is missing, so `electron-forge make` fails
- Use `npm run icons && npx tsc && rm -rf dist/ui && cp -r src/ui dist/ui && npx electron-forge start`
- Always kill all Electron processes before restart (see memory notes)
