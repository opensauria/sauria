# OpenSauria — Project Rules

## What is OpenSauria

OpenSauria is a security-first personal AI operating system. It runs as a local daemon that ingests information from multiple sources (MCP servers, email, calendars), builds a persistent knowledge graph (entities, relations, events), and exposes it through channels (Telegram, Slack, WhatsApp, Discord, Email) and an MCP server.

The desktop app (Electron) provides a visual canvas where users connect AI agents, draw edges between them, and orchestrate multi-agent workflows. The user is the "owner" who gives orders; agents collaborate through the orchestrator.

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
                                         └── Channels (Telegram, Slack, WhatsApp, Discord, Email)

Desktop (Electron) ──► Canvas UI (agent cards, edges, workspaces)
                     ├── Setup Wizard (OAuth + API key + local)
                     ├── Command Palette (provider status, Telegram mgmt)
                     └── IPC ──► vault, config, daemon management
```

## Tech Stack

- **Runtime**: Node.js 24+, ESM only
- **Language**: TypeScript strict mode (`verbatimModuleSyntax`, `noUncheckedIndexedAccess`)
- **Monorepo**: pnpm workspaces + Turborepo (`pnpm-workspace.yaml`, `turbo.json`)
- **Database**: SQLite via `better-sqlite3` (encrypted at rest)
- **AI Providers**: Anthropic (OAuth or API key), OpenAI, Google, Ollama (local)
- **Desktop**: Electron + Electron Forge (no framework, vanilla HTML/CSS/JS)
- **Build**: `tsdown` for daemon CLI bundle, Vite (via `@electron-forge/plugin-vite`) for desktop
- **Test**: Vitest
- **Validation**: Zod schemas

## Project Structure

```
apps/
  daemon/                          # Node.js daemon (CLI + background process)
    src/
      ai/                          # Multi-provider router, extraction, reasoning
      auth/                        # OAuth PKCE, API key validation, onboarding
      channels/                    # Telegram, Slack, WhatsApp, Discord, Email, registry
      config/                      # Zod schema, loader (re-exports @opensauria/config)
      db/                          # SQLite schema, world-model queries, search
      engine/                      # Proactive alerts, deadlines, pattern detection
      ingestion/                   # Pipeline, normalizer, dedup, MCP/email/calendar
      mcp/                         # MCP server (7 tools), MCP client manager
      orchestrator/                # Orchestrator, LLM router, autonomy, message queue
      security/                    # Audit, rate limiter, PII scrubber, sanitize
      setup/                       # Silent setup, daemon service, MCP client detection
      utils/                       # Logger, budget tracker, version
      cli.ts                       # Commander CLI entry point
      daemon.ts                    # Daemon process entry point
      daemon-lifecycle.ts          # Start/stop daemon context
    package.json  tsconfig.json  vitest.config.ts

  desktop/                         # Electron app
    src/
      main/                        # Main process (decomposed from monolithic main.ts)
        app.ts                     # Lifecycle, tray, shortcuts (~145 lines)
        daemon-manager.ts          # Spawn, kill, health check
        ipc-setup.ts               # Setup/configure/validate handlers
        ipc-oauth.ts               # OAuth PKCE flow (Anthropic)
        ipc-canvas.ts              # Canvas graph handlers
        ipc-channels.ts            # Channel connect/disconnect
        ipc-commands.ts            # Palette command execution
        ipc-brain.ts               # Brain query forwarding
        channel-connectors.ts      # Platform-specific connector functions
        daemon-client.ts           # Unix socket client
        owner-profile.ts           # OS profile resolution
        mcp-detection.ts           # MCP client detection
        local-providers.ts         # Local AI provider detection
      preload.ts                   # Context bridge
      window-canvas.ts             # Canvas window factory
      window-palette.ts            # Command palette window
      window-setup.ts              # Setup wizard window
      window-brain.ts              # Brain knowledge window
      renderer/
        canvas/index.html          # Agent canvas (inline JS, spring physics)
        canvas/canvas.css          # Canvas styles
        palette/index.html         # Command palette UI
        setup/index.html           # Setup wizard UI
        brain/index.html           # Brain knowledge graph UI
        shared.css                 # Imports @opensauria/design-tokens + shared components
    public/icons/                  # Brand + UI icons (copied by build script)
    scripts/copy-icons.js          # Icon build pipeline
    package.json  forge.config.ts  vite.*.config.ts

packages/
  types/                           # @opensauria/types (zero deps)
    src/                           # CanvasGraph, AgentNode, Edge, auth, IPC types
  config/                          # @opensauria/config (deps: zod, @opensauria/types)
    src/                           # paths.ts, schema.ts, defaults.ts
  vault/                           # @opensauria/vault (deps: @opensauria/config)
    src/                           # machine-id, derive-password, crypto, fs-sandbox
  ipc-protocol/                    # @opensauria/ipc-protocol (deps: zod, @opensauria/types)
    src/                           # IPC methods, owner command parsing
  design-tokens/                   # @opensauria/design-tokens (zero deps)
    src/tokens.ts                  # Typed source of truth
    generated/tokens.css           # CSS custom properties (generated)
    generated/tokens.json          # JSON (generated)

pnpm-workspace.yaml  turbo.json  tsconfig.base.json  package.json
```

### Dependency Graph

```
                @opensauria/types (zero deps)
                /      |       \
               /       |        \
@opensauria/config  @opensauria/ipc-protocol  @opensauria/design-tokens
       |
@opensauria/vault
       \              /
        \            /
     apps/daemon    apps/desktop
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
- Never mask, suppress, or hide warnings or deprecations (no `--no-deprecation`, no `--disable-warning`, no empty catch blocks). Fix the root cause.
- Audit logger for all channel and security events
- `{ success: false }` pattern in audit for failures
- Rate limiters on all inbound channels

### Security

- All user input goes through `sanitizeChannelInput()` before processing
- Vault secrets encrypted with AES-256-GCM, PBKDF2 key derivation (256k iterations, sha512)
- Vault password derived from hardware UUID (macOS `IOPlatformUUID`), NOT hostname
- Machine ID cached at `~/.opensauria/vault/.machine-id` — never changes
- URL allowlist for external fetches (`secureFetch`)
- PII scrubber before logging
- Rate limiting on every channel (per-minute caps)
- No secrets in code, all from vault
- Only `execFile` for subprocess execution (voice transcription). No `exec()`, no `eval()`, no shell interpolation.
- NEVER commit credentials, API keys, client IDs, tokens, passwords, or any sensitive values anywhere in the codebase — not in code, comments, docs, CLAUDE.md, or tests. Reference constants by variable name only.

### Authentication

- **OAuth PKCE** (recommended): Anthropic subscription, copy-paste code flow
  - Token endpoint expects **JSON body**, not form-urlencoded
  - Code from Anthropic is `code#state` — must split and send both in token exchange
  - Tokens stored in vault as `anthropic-oauth.enc`
  - Constants defined in `apps/desktop/src/main/ipc-oauth.ts` (`ANTHROPIC_OAUTH`) and `apps/daemon/src/auth/oauth.ts`
- **API key**: stored in vault as `<provider>-api-key.enc`
- **Local**: no credentials needed (Ollama, LM Studio)
- Desktop and daemon share the same vault format and key derivation

### Database

- SQLite with `better-sqlite3` (synchronous reads, async-wrapped writes)
- Schema applied on startup via `applySchema(db)`
- Tables: `entities`, `relations`, `events`, `observations`, `agent_messages`, `agent_conversations`, `agent_memory`, `agent_tasks`
- FTS5 for full-text search
- **Migrations**: `_migrations` table tracks applied migrations. `runMigrations()` runs after `applySchema()`. Indexes on new columns must be created inside the migration (after `ALTER TABLE`), not in `SCHEMA_SQL` — existing DBs would crash on `CREATE INDEX` for columns that don't exist yet.
- **Embeddings**: `apps/daemon/src/ai/embeddings.ts` imports `@huggingface/transformers` but the package was removed from `package.json`. Semantic search is broken until embeddings are migrated (to local Python model or re-added as dependency).

### Channels

- All channels implement the `Channel` interface from `channels/base.ts`
- Each channel has: `start()`, `stop()`, `sendAlert()`, `sendMessage()`, `sendToGroup()`
- Channels with orchestrator integration have `onInbound` callback in deps
- Per-node vault keys: `channel_token_<nodeId>` alongside legacy global keys

### Orchestrator

- `CanvasGraph` (v2) is the source of truth: nodes, edges, workspaces
- Graph stored at `~/.opensauria/canvas.json`, read by daemon on startup
- `MessageQueue` provides owner priority (unshift), graceful backpressure (never throws, evicts tail for owner messages), and `onError` callback
- `evaluateEdgeRules()` for deterministic routing, `LLMRoutingBrain` for intelligent routing
- `AutonomyEnforcer` filters actions based on agent autonomy level
- `ChannelRegistry` maps nodeId to channel instances
- **LLM Timeout**: `callLLM()` uses `Promise.race` with 30s timeout — prevents queue slots from being blocked forever
- **LLM Failure Fallback**: on LLM error, sends fallback reply to sender + escalates to owner (unless sender is owner). Internal messages route fallback back through the chain.
- **Prompt Token Cap**: `MAX_PROMPT_TOKENS = 4000`. Soft sections (workspace facts, agent facts, knowledge graph, peer messages) truncated first if over budget. Core sections (action schema, agents, hierarchy, history) never truncated.
- **DelegationTracker**: `delegation-tracker.ts` tracks `agent_tasks` deadlines (critical=30min, high=2h, normal=8h, low=24h). `sweepOverdueDelegations()` runs every 5min, auto-escalates overdue tasks to owner.
- **EscalationManager**: `findPendingForChannel(sourceNodeId)` matches escalations by channel, not just most-recent globally. Prevents misrouting when multiple agents escalate concurrently.

### Agent Collaboration

- **Internal Reply Routing**: `reply` action on internally-forwarded messages checks `registry.get(sourceNodeId)` — if the node has a registered external channel (e.g. Telegram bot), it replies directly to the owner on that channel. If no channel, routes back through the forwarding chain. This means any agent with a channel can contact the owner directly, regardless of hierarchy position.
- **Action Semantics**: `reply` = talk to owner (via own channel or back through chain). `forward` = talk to another agent internally. The LLM decides which action to use based on context — never inject explicit bot names or routing hints in prompts.
- **Forwarded Reply Context**: when replying to a forwarded message, the LLM is instructed to briefly state who asked and what for at the start of the reply, so the owner has context (e.g. "Kyra asked me to check X — here's what I found").
- **Shared Conversation Window**: forwards/notifies enriched with N most recent messages from source conversation (~150-200 tokens). `AgentMemory.getRecentMessagesForContext()` provides formatted context.
- **Workspace Memory Pool**: `agent_memory` table has `workspace_id` column. `AgentMemory.getWorkspaceFacts()` retrieves facts scoped to a workspace. LLM routing prompt injects up to 5 workspace facts (~100 tokens).
- **Peer Messages in Routing**: `buildRoutingPrompt()` includes recent messages from other nodes in the same workspace (up to 3 peer messages, ~100 tokens). Total additional overhead: ~350-400 tokens per routing decision.
- **Graph Persistence**: owner commands (`promote`, `reassign`, `fire`, `pause`) persist mutations to `canvas.json` via `persistGraph()`.
- **Hop Limit**: `MAX_INTERNAL_HOPS = 5` prevents infinite loops in internal agent-to-agent routing.
- Design doc: `docs/plans/2026-02-19-multi-agent-collaboration-design.md`

### Voice Transcription

- Platform-specific Whisper via Python subprocess (`execFile`, no shell)
- macOS: `mlx-whisper` (Apple Silicon optimized, `mlx-community/whisper-large-v3-turbo`)
- Linux/Windows: `faster-whisper` (`large-v3-turbo`)
- Python venv at `~/.opensauria/venv/` (managed separately from Node.js deps)
- Config: `channels.telegram.voice.model` defaults to `'auto'` (resolves per platform)
- `TranscriptionService` in `apps/daemon/src/channels/transcription.ts`
- Max audio size: 20 MB, configurable timeout via `maxDurationSeconds`

## Desktop UI Design

### Design Tokens (`@opensauria/design-tokens`)

Source of truth: `packages/design-tokens/src/tokens.ts` (typed `as const`).
Generated outputs: `tokens.css` (CSS custom properties), `tokens.json`.
Desktop `shared.css` imports via `@import '@opensauria/design-tokens/tokens.css'`.

```
--bg: #1a1a1a          --surface: rgba(255,255,255,0.04)
--border: rgba(255,255,255,0.08)  --text: #ececec
--text-secondary: #999  --text-dim: #555
--accent: #038B9A       --accent-hover: #027A87
--success: #34d399      --error: #f87171
--radius: 12px          --radius-sm: 8px
--radius-pill: 9999px
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
- Desktop manages daemon spawn with `daemonStarting` guard and `restartDaemon()`
- `restartDaemon()` waits for old process to exit before spawning new one
- ProactiveEngine errors are caught (best-effort, non-fatal)

## Electron Build

- Entry point: `apps/desktop/src/main/app.ts` (thin lifecycle orchestrator)
- Vite bundles main, preload, and renderer via `@electron-forge/plugin-vite`
- `assets/icon.icns` is missing, so `electron-forge make` (DMG) fails — use `package` instead
- Dev: `cd apps/desktop && pnpm dev` (icons + electron-forge start with Vite HMR)
- Package: `cd apps/desktop && pnpm run package`
- Always kill all Electron processes before restart (see memory notes)
- Daemon bundle must be rebuilt separately: `pnpm -F opensauria-daemon build`
- Renderer files live in `apps/desktop/src/renderer/{canvas,palette,setup,brain}/`
- Icons are static assets in `apps/desktop/public/icons/` (served at `/icons/`)

## Build Checklist

```
pnpm -r build                    # Build all packages + apps
pnpm -F opensauria-daemon build    # Rebuild daemon only
pnpm -F opensauria-desktop dev     # Start desktop in dev mode
pnpm -F opensauria-daemon test     # Run daemon tests
pnpm -r typecheck                # Typecheck all packages
```

When changing shared packages (`packages/*`): rebuild with `pnpm -r build` (Turbo handles deps)
When changing daemon code (`apps/daemon/src/`): `pnpm -F opensauria-daemon build`
When changing desktop main (`apps/desktop/src/main/`): Vite rebuilds automatically in dev mode
When changing renderer files (`apps/desktop/src/renderer/`): Vite hot-reloads in dev mode
Full restart: kill Electron + daemon, `pnpm -r build`, start desktop
