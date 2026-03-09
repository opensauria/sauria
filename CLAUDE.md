# Sauria — Project Rules

## What is Sauria

Sauria is your AI workforce. A security-first local daemon that ingests information from multiple sources (MCP servers, email, calendars), builds a persistent knowledge graph (entities, relations, events), and exposes it through channels (Telegram, Slack, WhatsApp, Discord, Email) and an MCP server.

The desktop app (Tauri v2) provides a visual canvas where users connect AI agents, draw edges between them, and orchestrate multi-agent workflows. The user is the "owner" who gives orders; agents collaborate through the orchestrator.

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

Desktop (Tauri v2) ──► Canvas UI (agent cards, edges, workspaces)
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
- **Desktop**: Tauri v2 (Rust backend, vanilla HTML/CSS/JS renderer)
- **Build**: `tsdown` for daemon CLI bundle, Vite for desktop renderer
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
      config/                      # Zod schema, loader (re-exports @sauria/config)
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

  desktop/                         # Tauri v2 app
    src/
      renderer/
        canvas/index.html          # Agent canvas (inline JS, spring physics)
        canvas/canvas.css          # Canvas styles
        palette/index.html         # Command palette UI
        setup/index.html           # Setup wizard UI
        brain/index.html           # Brain knowledge graph UI
        shared.css                 # Imports @sauria/design-tokens + shared components
    src-tauri/src/
      main.rs                      # Tauri app builder, shortcut, daemon launch
      daemon_manager.rs            # Spawn, kill, health check (cross-platform)
      daemon_client.rs             # IPC client (Unix socket / TCP)
      windows.rs                   # Palette window, navigation, animation
      cmd_commands.rs              # Palette command execution
      cmd_canvas.rs                # Canvas graph handlers
      cmd_channels.rs              # Channel connect/disconnect
      cmd_setup.rs                 # Setup/configure/validate
      cmd_brain.rs                 # Brain query forwarding
      cmd_oauth.rs                 # OAuth PKCE flow
      vault.rs                     # Vault encryption (AES-256-GCM)
      paths.rs                     # Cross-platform path resolution
    public/icons/                  # Brand + UI icons (copied by build script)
    scripts/copy-icons.js          # Icon build pipeline
    scripts/copy-native-deps.js    # Native Node module staging for bundling
    package.json  vite.config.ts

packages/
  types/                           # @sauria/types (zero deps)
    src/                           # CanvasGraph, AgentNode, Edge, auth, IPC types
  config/                          # @sauria/config (deps: zod, @sauria/types)
    src/                           # paths.ts, schema.ts, defaults.ts
  vault/                           # @sauria/vault (deps: @sauria/config)
    src/                           # machine-id, derive-password, crypto, fs-sandbox
  ipc-protocol/                    # @sauria/ipc-protocol (deps: zod, @sauria/types)
    src/                           # IPC methods, owner command parsing
  design-tokens/                   # @sauria/design-tokens (zero deps)
    src/tokens.ts                  # Typed source of truth
    generated/tokens.css           # CSS custom properties (generated)
    generated/tokens.json          # JSON (generated)

pnpm-workspace.yaml  turbo.json  tsconfig.base.json  package.json
```

### Dependency Graph

```
                @sauria/types (zero deps)
                /      |       \
               /       |        \
@sauria/config  @sauria/ipc-protocol  @sauria/design-tokens
       |
@sauria/vault
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
- Audit logger for all channel and security events
- `{ success: false }` pattern in audit for failures
- Rate limiters on all inbound channels

### Security

- All user input goes through `sanitizeChannelInput()` before processing
- Vault secrets encrypted with AES-256-GCM, PBKDF2 key derivation (256k iterations, sha512)
- Vault password derived from hardware UUID (macOS `IOPlatformUUID`), NOT hostname
- Machine ID cached at `~/.sauria/vault/.machine-id` — never changes
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
- **Embeddings**: `apps/daemon/src/ai/embeddings.ts` imports `@huggingface/transformers` but the package was removed from `package.json`. Semantic search is broken until embeddings are migrated (to local Python model or re-added as dependency).

### Channels

- All channels implement the `Channel` interface from `channels/base.ts`
- Each channel has: `start()`, `stop()`, `sendAlert()`, `sendMessage()`, `sendToGroup()`
- Channels with orchestrator integration have `onInbound` callback in deps
- Per-node vault keys: `channel_token_<nodeId>` alongside legacy global keys

### Orchestrator

- `CanvasGraph` (v2) is the source of truth: nodes, edges, workspaces
- Graph stored at `~/.sauria/canvas.json`, read by daemon on startup
- `MessageQueue` provides owner priority (unshift) and backpressure
- `evaluateEdgeRules()` for deterministic routing, `LLMRoutingBrain` for intelligent routing
- `AutonomyEnforcer` filters actions based on agent autonomy level
- `ChannelRegistry` maps nodeId to channel instances

### Agent Collaboration

- **Shared Conversation Window**: forwards/notifies enriched with N most recent messages from source conversation (~150-200 tokens). `AgentMemory.getRecentMessagesForContext()` provides formatted context.
- **Workspace Memory Pool**: `agent_memory` table has `workspace_id` column. `AgentMemory.getWorkspaceFacts()` retrieves facts scoped to a workspace. LLM routing prompt injects up to 5 workspace facts (~100 tokens).
- **Peer Messages in Routing**: `buildRoutingPrompt()` includes recent messages from other nodes in the same workspace (~100 tokens). Total additional overhead: ~350-400 tokens per routing decision (negligible vs base ~2000-4000).
- **Graph Persistence**: owner commands (`promote`, `reassign`, `fire`, `pause`) persist mutations to `canvas.json` via `persistGraph()`.
- **Inter-agent isolation**: `forward`, `notify`, `send_to_all`, `group_message` route via `handleInbound()` (internal). Only owner-agent communication uses `registry.sendTo()` (external channels).
- Design details documented in the Agent Collaboration section above

### Routing Logic (CRITICAL — read before touching orchestrator or llm-router)

#### LLM Prompt: Agent List MUST Include Node IDs

`buildRoutingPrompt()` in `llm-router.ts` lists team agents with their `nodeId`:

```
- @karl_bot (specialist) [nodeId: "abc123"] on telegram
```

Without node IDs, the LLM cannot construct valid `forward` actions (requires `targetNodeId`), and all forwards get filtered out → agents fall back to `reply` and fabricate responses instead of delegating. **NEVER remove node IDs from the agent list.**

#### LLM Prompt: Delegation and Reply Semantics

Critical prompt instructions in `llm-router.ts`:

- **DELEGATION**: When the owner mentions another agent by name, the current agent MUST `forward` to that agent. Never fabricate what another agent would say.
- **REPLY vs FORWARD**: `reply` sends response back (to owner for direct messages, to sender agent for forwarded messages). `forward` sends to a DIFFERENT agent. These are NOT interchangeable.
- **INTERNAL DEBATE**: Forwarded replies go back internally to the sender agent. The owner never sees intermediate debate. Only the agent who received the owner's original message sends the final answer.
- **BEHAVIOR TOGGLES**: `behavior.ownerResponse`, `behavior.proactive`, `behavior.peer` from agent settings are injected into the routing prompt.

#### Reply Routing: Internal-First

`executeAction('reply', ...)` in `orchestrator.ts` follows this logic:

```
Agent receives forwarded message (forwardDepth > 0, replyToNodeId ≠ sourceNodeId)?
  └── ALWAYS route internally back to forwarding agent via handleInbound()
Agent received direct message (forwardDepth = 0) → reply via own channel (normal path)
```

**Key invariant**: forwarded replies ALWAYS go back internally to the originating agent. The owner only sees the final answer from the agent they originally talked to. This prevents internal debate from leaking to the owner.

#### Forward Action: Always Internal

`forward`, `notify`, `send_to_all`, `group_message` always create a synthetic `InboundMessage` and call `handleInbound()` (internal routing). They NEVER call `registry.sendTo()` (external channel). This keeps inter-agent communication inside the orchestrator.

#### Forward Depth Protection

- `forwardDepth` increments on each `forward` action
- `MAX_FORWARD_DEPTH = 3` — `handleInbound()` drops messages at this depth
- Forwarded replies preserve depth (don't increment) — only new forwards increment
- This gives ~3 rounds of agent-to-agent debate before the chain stops

#### Edge Animation: Bidirectional Matching

`animateEdgeTravel()` in `canvas/main.ts` matches edges in BOTH directions:

```ts
graph.edges.find(
  (e) => (e.from === fromId && e.to === toId) || (e.from === toId && e.to === fromId),
);
```

For reverse messages (reply B→A on edge A→B), the dot travels `totalLength→0` along the edge's canonical curve. Edge glow activates for both directions.

### Voice Transcription

- Platform-specific Whisper via Python subprocess (`execFile`, no shell)
- macOS: `mlx-whisper` (Apple Silicon optimized, `mlx-community/whisper-large-v3-turbo`)
- Linux/Windows: `faster-whisper` (`large-v3-turbo`)
- Python venv at `~/.sauria/venv/` (managed separately from Node.js deps)
- Config: `channels.telegram.voice.model` defaults to `'auto'` (resolves per platform)
- `TranscriptionService` in `apps/daemon/src/channels/transcription.ts`
- Max audio size: 20 MB, configurable timeout via `maxDurationSeconds`

## Desktop UI Design

### Design Tokens (`@sauria/design-tokens`)

Source of truth: `packages/design-tokens/src/tokens.ts` (typed `as const`).
Generated outputs: `tokens.css` (CSS custom properties), `tokens.json`.
Desktop `shared.css` imports via `@import '@sauria/design-tokens/tokens.css'`.

```
--bg: #1a1a1a          --surface: rgba(255,255,255,0.04)
--border: rgba(255,255,255,0.08)  --text: #ececec
--text-secondary: #999  --text-dim: #555
--accent: #038B9A       --accent-hover: #027A87
--success: #34d399      --error: #f87171
--warning: #f59e0b      --overlay: rgba(0,0,0,0.5)
--radius: 12px          --radius-sm: 8px
--radius-lg: 16px       --radius-pill: 9999px
--font-size-micro: 10px --font-size-small: 12px
--font-size-base: 14px  --font-size-heading: 16px
--entity-person: #3b82f6  --entity-project: #34d399  (+ 6 more)
```

### Spacing & Sizing — Multiples of 4 (ALWAYS)

- **All spacing/sizing values must be multiples of 4**: 4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 44, 48...
- Applies to: spacing, padding, margin, gap, width, height, border-radius, icon size
- Never use non-multiples of 4: no 5px, 6px, 9px, 15px, 17px, etc.
- 2px exception: borders only
- Preferred grid: 8px increments for spacing (8, 16, 24, 32, 40, 48)
- 4px for micro-spacing (icon gaps, tight elements)
- Font sizes use even type scale: 10, 12, 14, 16, 18, 20, 24

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
- Daemon writes JSON status line to stdout on startup: `{"status":"ready"}` or `{"status":"error","message":"..."}`
- `startIpcServer()` is async — awaits socket readiness before signaling "ready"

## Tauri Build

- Entry point: `apps/desktop/src-tauri/src/main.rs` → Tauri app builder
- Vite builds renderer to `apps/desktop/dist/` (configured in `tauri.conf.json` → `build.frontendDist`)
- `tauri.conf.json` is at `apps/desktop/src-tauri/tauri.conf.json`
- Dev: `pnpm -F sauria-desktop dev` (Vite HMR + Tauri dev server)
- Build: `pnpm -r build` only builds packages/daemon (Turborepo may cache desktop). For a **full production build** always run explicitly: `cd apps/desktop && pnpm run build` — this runs Vite + Rust compilation + `.app` bundling
- **NEVER manually patch files inside `/Applications/Sauria.app/`** — always do a full `tauri build` and replace the entire `.app`. Manual patching leads to frontend/daemon version mismatch.
- After build, install: `rm -rf /Applications/Sauria.app && cp -R apps/desktop/src-tauri/target/release/bundle/macos/Sauria.app /Applications/Sauria.app`
- Always kill all processes before restart: `pkill -9 -f "sauria"; pkill -9 -f "Sauria"; pkill -9 -f "tauri"; lsof -ti:5173 | xargs kill -9`
- Renderer files live in `apps/desktop/src/renderer/{canvas,palette,setup,brain}/`
- Icons are static assets in `apps/desktop/public/icons/` (served at `/icons/`)

### Daemon Bundling (CRITICAL)

- Tauri does NOT auto-include the Node.js daemon — it only bundles Rust binary + frontend assets
- The daemon JS bundle (`apps/daemon/dist/`) MUST be declared in `tauri.conf.json` → `bundle.resources`
- Resources land in `Contents/Resources/` on macOS
- Use `app.path().resolve("daemon/index.mjs", BaseDirectory::Resource)` in Rust to resolve at runtime
- `DaemonState` receives the resolved path from `AppHandle` after Tauri setup (not at construction)
- Dev mode fallback: daemon dist is at its normal monorepo path (`../../daemon/dist/index.mjs`)
- Error signature when broken: `daemon.err` shows `Cannot find module '/sauria'`

### tsdown Config (CRITICAL)

- `tsdown.config.ts` MUST use `noExternal: [/.*/]` to inline ALL dependencies (npm + workspace)
- `external: ['better-sqlite3']` — only native `.node` modules stay external
- Without `noExternal: [/.*/]`, npm deps (zod, grammy, commander, etc.) remain as imports → crash in bundled `.app`
- NEVER change to `noExternal: ['@sauria/*']` — that only inlines workspace packages

### Native Node Module Bundling

- `better-sqlite3` has a native `.node` binding that cannot be inlined by tsdown
- Runtime deps chain: `better-sqlite3` → `bindings` → `file-uri-to-path`
- `scripts/copy-native-deps.js` stages only runtime files to `native-deps/` (~1.9MB vs 12MB+ full)
- `tauri.conf.json` bundles `native-deps/` as `node_modules` resource
- `beforeBuildCommand` runs `pnpm run native-deps` before Vite build
- `daemon_manager.rs` passes `NODE_PATH` env var pointing to bundled `Contents/Resources/node_modules/`
- Error signature when broken: `Cannot find module 'bindings'` or `Cannot find module 'better-sqlite3'`

### Palette Window Architecture

- Single frameless window navigates between palette/canvas/brain/setup views
- `navigate_palette_to()` handles all view transitions with animation
- NEVER open canvas/brain as standalone windows — breaks back navigation
- `navigate_palette_back()` restores previous view with reverse animation
- Drag regions: `data-tauri-drag-region` HTML attribute + CSS `-webkit-app-region: drag`
- Interactive elements inside drag regions need `-webkit-app-region: no-drag`

## Build Checklist

```
pnpm -r build                              # Build shared packages + daemon (Turborepo, may cache desktop)
pnpm -F @sauria/cli build           # Rebuild daemon only
cd apps/desktop && pnpm run build          # Full production build (Vite + Rust + .app bundle) — ALWAYS use this for production
pnpm -F sauria-desktop dev             # Start desktop in dev mode (Vite HMR)
pnpm -F @sauria/cli test            # Run daemon tests
pnpm -r typecheck                          # Typecheck all packages
```

### Production Deploy (CRITICAL)

Always follow this exact sequence — no shortcuts:

```bash
# 1. Kill everything
pkill -9 -f "sauria"; pkill -9 -f "Sauria"; pkill -9 -f "tauri"; lsof -ti:5173 | xargs kill -9

# 2. Full production build
pnpm -r build                              # packages + daemon
cd apps/desktop && pnpm run build          # Vite + Rust + .app bundle

# 3. Install
rm -rf /Applications/Sauria.app
cp -R apps/desktop/src-tauri/target/release/bundle/macos/Sauria.app /Applications/Sauria.app

# 4. Launch
open /Applications/Sauria.app
```

**NEVER manually copy files into `/Applications/Sauria.app/Contents/Resources/`** — always rebuild the full `.app`.

### Pre-Push Checklist (CRITICAL — run before every push)

```bash
pnpm run format:check                     # Prettier must pass (includes pnpm-lock.yaml)
pnpm -r typecheck                          # TypeScript strict mode, zero errors
pnpm -F @sauria/cli test               # All tests green
pnpm -F @sauria/cli build              # Daemon build must exit 0
```

If `pnpm-lock.yaml` changes (dependency add/update/remove), ALWAYS run `npx prettier --write pnpm-lock.yaml` before committing. CI will reject unformatted lockfiles.

### CI Security Scan Exclusions

The CI and release workflows run a banned-pattern scan. Legitimate uses of `createServer`, `.listen(`, `child_process` etc. must be excluded. Both `ci.yml` and `release.yml` MUST have identical exclusion lists:

```
--exclude=*banned-patterns* --exclude=*whatsapp*
--exclude=*transcription* --exclude=*vault-key*
--exclude=*resolve* --exclude=*machine-id*
--exclude=*daemon-ipc*
```

When adding a new file that legitimately uses a banned pattern, add it to BOTH `ci.yml` AND `release.yml` exclusion lists. Never update one without the other.

### Release Process

Releases use CalVer (`vYYYY.MDD.PATCH`), e.g. `v2026.309.0` for March 9, 2026. Same-day respin increments PATCH (`v2026.309.1`). All three semver parts are numeric.

The process is fully automated:

1. Trigger "Release PR" workflow manually in GitHub Actions
2. Review and merge the release PR into main
3. Push to main triggers `release.yml`: create tag → verify → [npm-publish, desktop] → GitHub Release + SBOM + desktop binaries

- Release PRs branch from `release/v*` — if a stale branch exists from a failed attempt, delete it before retrying
- The `production` environment requires manual approval from `@teobouancheau`
- npm publish uses provenance attestation (`--provenance`)

### GitHub Repository Settings

- **Repo**: `opensauria/sauria` (public, AGPL-3.0-or-later)
- **Rulesets**: main (PR + CODEOWNERS review), develop (no force push), tags v\* (no delete/force push)
- **Admin bypass**: `@teobouancheau` can bypass rulesets (solo maintainer)
- **Merge**: squash merge only, auto-delete branches
- **Actions**: read-only default permissions, selected actions only (GitHub-owned + verified + 5 trusted: softprops/action-gh-release, anchore/sbom-action, pnpm/action-setup, dtolnay/rust-toolchain, apple-actions/import-codesign-certs)
- **Environment `production`**: required reviewer `@teobouancheau`, deployment restricted to `v*` tags
- **Secrets**: npm uses OIDC trusted publishing (no token needed)
- **CODEOWNERS**: `* @teobouancheau`

### Dev Workflow

When changing shared packages (`packages/*`): rebuild with `pnpm -r build` (Turbo handles deps)
When changing daemon code (`apps/daemon/src/`): `pnpm -F @sauria/cli build`
When changing desktop main (`apps/desktop/src-tauri/src/`): Rust recompiles on `tauri dev`
When changing renderer files (`apps/desktop/src/renderer/`): Vite hot-reloads in dev mode
