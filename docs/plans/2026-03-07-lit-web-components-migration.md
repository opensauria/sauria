# Lit Web Components Migration — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Migrate `canvas/main.ts` (4313 lines vanilla JS) to Lit Web Components — zero visual changes, every pixel preserved.

**Architecture:** Split the monolithic file into ~22 Lit components, reactive controllers, and a shared context layer. The root `<sauria-canvas>` element orchestrates state via Lit Context. Each component owns its styles (Shadow DOM) and renders reactively. SVG edge layer uses Light DOM for coordinate consistency.

**Tech Stack:** Lit 3.x, `@lit/context`, `@lit/task`, TypeScript decorators, Vite (already configured)

---

## Pre-flight: Terminology & Patterns

- **ReactiveController**: Lit pattern for shared behaviors (physics, drag, sync). Attaches to host via `addController()`.
- **Lit Context**: Dependency injection via `@provide` / `@consume` decorators. Only consumers that read a value re-render.
- **Light DOM for SVG**: Components that render SVG into the parent DOM use `createRenderRoot() { return this; }` to avoid Shadow DOM breaking SVG coordinate spaces.
- **CSS containment**: `contain: layout style paint` on agent cards for rendering isolation on low-power devices (Raspberry Pi).

## File Structure (target)

```
apps/desktop/src/renderer/
  canvas/
    index.html                       # Simplified: mounts <sauria-canvas>
    canvas.css                       # KEPT: global canvas styles (viewport, grid)
    main.ts                          # DELETED after migration
    sauria-canvas.ts                 # Root custom element (<200 lines)
    types.ts                         # Shared interfaces (~85 lines)
    constants.ts                     # Platform icons, languages, templates (~90 lines)
    ipc.ts                           # Typed Tauri invoke wrappers (~60 lines)
    components/
      empty-state.ts                 # <canvas-empty-state>
      canvas-toolbar.ts              # <canvas-toolbar>
      workspace-frame.ts             # <workspace-frame>
      workspace-dialog.ts            # <workspace-dialog>
      agent-card.ts                  # <agent-card> (connected portrait)
      agent-card-setup.ts            # <agent-card-setup> (credential form)
      edge-layer.ts                  # <edge-layer> (Light DOM SVG)
      edge-activity.ts               # <edge-activity> (activity dots + bubbles)
      coverflow-dock.ts              # <coverflow-dock> (spring physics)
      agent-detail-panel.ts          # <agent-detail-panel> (right panel)
      workspace-detail-panel.ts      # <workspace-detail-panel>
      conversation-panel.ts          # <conversation-panel>
      confirm-dialog.ts              # <confirm-dialog>
      activity-legend.ts             # <canvas-legend>
      orbital-bubbles.ts             # <orbital-bubbles> (integration hover)
    controllers/
      viewport-controller.ts         # Pan, zoom, CSS zoom transform
      drag-controller.ts             # Node drag, workspace drag/resize
      graph-sync-controller.ts       # IPC load, save (debounced), file watcher
      activity-controller.ts         # Tauri event listeners, node active state
```

---

### Task 1: Install Lit and configure TypeScript

**Files:**
- Modify: `apps/desktop/package.json`
- Modify: `apps/desktop/tsconfig.json`

**Step 1: Install Lit dependencies**

Run:
```bash
cd apps/desktop && pnpm add lit @lit/context @lit/task
```

**Step 2: Enable decorators in tsconfig.json**

Add to `compilerOptions`:
```json
"experimentalDecorators": true,
"useDefineForClassFields": false
```

**Step 3: Verify Vite still builds**

Run: `cd apps/desktop && pnpm run build:vite`
Expected: Build succeeds (no canvas changes yet, just config)

**Step 4: Commit**

```
chore: add lit dependencies and enable decorators
```

---

### Task 2: Create shared types, constants, and IPC wrappers

**Files:**
- Create: `apps/desktop/src/renderer/canvas/types.ts`
- Create: `apps/desktop/src/renderer/canvas/constants.ts`
- Create: `apps/desktop/src/renderer/canvas/ipc.ts`

**Step 1: Extract types.ts**

Extract from `main.ts` lines 9-115: `Viewport`, `AgentNode`, `Edge`, `Workspace`, `IntegrationInstance`, `IntegrationDef`, `CanvasGraph`, `OwnerProfile`, `ConnectResult`, `PlatformField`, `EdgeGeometry`, `ConvMessage`.

```ts
// types.ts — all canvas interfaces
export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

export interface AgentNode {
  id: string;
  platform: string;
  label: string;
  photo: string | null;
  position: { x: number; y: number };
  status: string;
  credentials: string;
  meta: Record<string, string>;
  workspaceId?: string | null;
  role?: string;
  autonomy?: number | string;
  instructions?: string;
  description?: string;
  behavior?: {
    proactive?: boolean;
    ownerResponse?: boolean;
    peer?: boolean;
  };
  _formData?: Record<string, string>;
  _statusMsg?: string;
  _statusType?: string;
  _animateIn?: boolean;
  _editing?: boolean;
  integrations?: string[];
}

// ... remaining interfaces (Edge, Workspace, etc.)
```

**Step 2: Extract constants.ts**

Extract: `platformIcons`, `RESPONSE_LANGUAGES`, `CEO_TEMPLATE`, `BOT_TEMPLATE`, `getFieldsForPlatform()`, `CARD_FALLBACK_W`, `CARD_FALLBACK_H`.

**Step 3: Extract ipc.ts**

Typed wrappers around `invoke()`:
```ts
import { invoke } from '@tauri-apps/api/core';
import type { CanvasGraph, OwnerProfile, ConnectResult } from './types.js';

export function getCanvasGraph(): Promise<CanvasGraph> {
  return invoke<CanvasGraph>('get_canvas_graph');
}

export function saveCanvasGraph(graph: CanvasGraph): Promise<void> {
  return invoke('save_canvas_graph', { graph });
}

export function connectChannel(platform: string, credentials: Record<string, string>): Promise<ConnectResult> {
  return invoke<ConnectResult>('connect_channel', { platform, credentials });
}

export function disconnectChannel(platform: string, nodeId: string): Promise<void> {
  return invoke('disconnect_channel', { platform, nodeId });
}

export function getOwnerProfile(): Promise<OwnerProfile> {
  return invoke<OwnerProfile>('get_owner_profile');
}

// ... remaining IPC calls (save_agent_detail, load_agent_kpis, etc.)
```

**Step 4: Verify typecheck**

Run: `cd apps/desktop && pnpm run typecheck`
Expected: PASS (new files are standalone, main.ts unchanged)

**Step 5: Commit**

```
refactor: extract canvas types, constants, and IPC wrappers
```

---

### Task 3: Create graph-sync controller and viewport controller

**Files:**
- Create: `apps/desktop/src/renderer/canvas/controllers/graph-sync-controller.ts`
- Create: `apps/desktop/src/renderer/canvas/controllers/viewport-controller.ts`

**Step 1: Implement GraphSyncController**

Manages: graph load, save (debounced 300ms), owner node auto-creation, catalog preload.

```ts
import { ReactiveController, type ReactiveControllerHost } from 'lit';
import type { CanvasGraph } from '../types.js';
import { getCanvasGraph, saveCanvasGraph, getOwnerProfile } from '../ipc.js';

export class GraphSyncController implements ReactiveController {
  host: ReactiveControllerHost;
  graph: CanvasGraph = { nodes: [], edges: [], workspaces: [], globalInstructions: '', viewport: { x: 0, y: 0, zoom: 1 } };
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(host: ReactiveControllerHost) {
    this.host = host;
    host.addController(this);
  }

  hostConnected(): void { /* noop — init() is called explicitly */ }
  hostDisconnected(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
  }

  async init(): Promise<void> {
    try { this.graph = await getCanvasGraph(); } catch { /* fallback empty */ }
    // ... owner node setup (same logic as current init())
    this.host.requestUpdate();
  }

  save(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      saveCanvasGraph(this.graph);
    }, 300);
  }

  // ... updateNode(), addNode(), removeNode(), addEdge(), removeEdge()
}
```

**Step 2: Implement ViewportController**

Manages: vpX, vpY, vpZoom, CSS zoom transform, pan start/stop.

```ts
export class ViewportController implements ReactiveController {
  x = 0; y = 0; zoom = 1;
  private isPanning = false;
  private panStartX = 0; private panStartY = 0;
  private panStartVpX = 0; private panStartVpY = 0;

  applyTransform(world: HTMLElement): void {
    (world.style as Record<string, string>).zoom = String(this.zoom);
    world.style.transform = `translate(${this.x / this.zoom}px, ${this.y / this.zoom}px)`;
  }

  setZoom(z: number): void {
    this.zoom = Math.max(0.15, Math.min(3, z));
    this.host.requestUpdate();
  }

  startPan(e: MouseEvent): void { /* ... */ }
  updatePan(e: MouseEvent): void { /* ... */ }
  stopPan(): void { /* ... */ }

  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return { x: (sx - this.x) / this.zoom, y: (sy - this.y) / this.zoom };
  }
}
```

**Step 3: Verify typecheck**

Run: `cd apps/desktop && pnpm run typecheck`

**Step 4: Commit**

```
feat: add graph-sync and viewport reactive controllers
```

---

### Task 4: Create drag controller and activity controller

**Files:**
- Create: `apps/desktop/src/renderer/canvas/controllers/drag-controller.ts`
- Create: `apps/desktop/src/renderer/canvas/controllers/activity-controller.ts`

**Step 1: Implement DragController**

Manages: node drag, workspace drag (magnetic — moves contained cards), workspace resize, edge drag.

Key state: `isDragging`, `dragNodeId`, `isWsDragging`, `wsDragId`, `isWsResizing`, `wsResizeId`, `isEdgeDragging`, `edgeFromId`.

The controller exposes `handleMouseDown()`, `handleMouseMove()`, `handleMouseUp()` which the root canvas element delegates to.

**Step 2: Implement ActivityController**

Manages: Tauri event listeners (`activity:edge`, `activity:node`, `activity:message`), `activeNodeIds` set, `edgeAnimCounts`, `conversationBuffer`, `unreadCount`.

```ts
import { ReactiveController } from 'lit';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { ConvMessage } from '../types.js';

export class ActivityController implements ReactiveController {
  activeNodeIds = new Set<string>();
  conversationBuffer = new Map<string, ConvMessage[]>();
  unreadCount = 0;
  private unlisteners: UnlistenFn[] = [];

  async hostConnected(): Promise<void> {
    this.unlisteners.push(
      await listen('activity:edge', (e) => { /* animateEdgeTravel dispatch */ }),
      await listen('activity:node', (e) => { /* setNodeActivityState */ }),
      await listen('activity:message', (e) => { /* buffer + feed */ }),
    );
  }

  hostDisconnected(): void {
    for (const fn of this.unlisteners) fn();
    this.unlisteners = [];
  }
}
```

**Step 3: Verify typecheck**

**Step 4: Commit**

```
feat: add drag and activity reactive controllers
```

---

### Task 5: Create simple leaf components

**Files:**
- Create: `apps/desktop/src/renderer/canvas/components/empty-state.ts`
- Create: `apps/desktop/src/renderer/canvas/components/canvas-toolbar.ts`
- Create: `apps/desktop/src/renderer/canvas/components/confirm-dialog.ts`
- Create: `apps/desktop/src/renderer/canvas/components/activity-legend.ts`

**Step 1: Implement `<canvas-empty-state>`**

Simple component — shows/hides based on `nodeCount` property:
```ts
@customElement('canvas-empty-state')
export class CanvasEmptyState extends LitElement {
  @property({ type: Number }) nodeCount = 0;

  render() {
    if (this.nodeCount > 0) return nothing;
    return html`<div class="canvas-empty">...</div>`;
  }
}
```

**Step 2: Implement `<canvas-toolbar>`**

Properties: `zoom` (number). Events: `zoom-in`, `zoom-out`, `zoom-reset`, `toggle-feed`, `add-workspace`.

**Step 3: Implement `<confirm-dialog>`**

Properties: `open` (boolean), `message` (string). Events: `confirm`, `cancel`.

**Step 4: Implement `<canvas-legend>`**

Properties: `visible` (boolean). Auto-hides after 10s via timer.

**Step 5: Verify typecheck**

**Step 6: Commit**

```
feat: add leaf canvas components (empty-state, toolbar, dialog, legend)
```

---

### Task 6: Create workspace components

**Files:**
- Create: `apps/desktop/src/renderer/canvas/components/workspace-frame.ts`
- Create: `apps/desktop/src/renderer/canvas/components/workspace-dialog.ts`
- Create: `apps/desktop/src/renderer/canvas/components/workspace-detail-panel.ts`

**Step 1: Implement `<workspace-frame>`**

Properties: `workspace` (Workspace), `selected` (boolean), `agentCount` (number).
Events: `workspace-select`, `workspace-drag-start`, `workspace-resize-start`, `workspace-lock-toggle`, `workspace-edit`.
Renders: colored border rectangle, header with name/count/purpose, lock/gear buttons, resize handles.

**Step 2: Implement `<workspace-dialog>`**

Properties: `open` (boolean). Events: `workspace-create` (with name, color, purpose, topics, budget), `cancel`.
Renders: modal overlay with form fields — name, color swatches, purpose textarea, topics input, budget stepper.

**Step 3: Implement `<workspace-detail-panel>`**

Properties: `workspace` (Workspace | null). Events: `workspace-update`, `close`.
Renders: right panel with name input, color picker, purpose, tags, budget. Auto-saves on change.

**Step 4: Verify typecheck**

**Step 5: Commit**

```
feat: add workspace components (frame, dialog, detail panel)
```

---

### Task 7: Create agent card components

**Files:**
- Create: `apps/desktop/src/renderer/canvas/components/agent-card.ts`
- Create: `apps/desktop/src/renderer/canvas/components/agent-card-setup.ts`

**Step 1: Implement `<agent-card>`**

Properties: `node` (AgentNode), `selected` (boolean), `active` (boolean).
Events: `card-select`, `card-drag-start`, `card-gear`, `edge-drag-start`.
Renders 3 variants based on `node.platform` and `node.status`:
- **Owner card**: avatar with initials/photo, "YOU" badge, output port only
- **Connected card**: avatar with status dot, platform badge, bot info, input+output ports
- **Error state**: delegates to `<agent-card-setup>` with error message

Uses CSS containment: `contain: layout style paint` for rendering isolation.

**Step 2: Implement `<agent-card-setup>`**

Properties: `node` (AgentNode), `isConnecting` (boolean).
Events: `connect`, `cancel`, `disconnect`, `close-edit`.
Renders: credential form with platform-specific fields from `getFieldsForPlatform()`.
Includes status messages (connecting spinner, error).

**Step 3: Verify typecheck**

**Step 4: Commit**

```
feat: add agent card components (portrait + setup form)
```

---

### Task 8: Create edge layer (Light DOM SVG)

**Files:**
- Create: `apps/desktop/src/renderer/canvas/components/edge-layer.ts`
- Create: `apps/desktop/src/renderer/canvas/components/edge-activity.ts`

**Step 1: Implement `<edge-layer>`**

**Light DOM** — overrides `createRenderRoot() { return this; }` because SVG coordinate systems break across Shadow DOM boundaries.

Properties: `edges` (Edge[]), `nodes` (AgentNode[]).
Events: `edge-delete`.
Renders: SVG with `<defs>` (per-edge gradients), edge groups (hit area + gradient line + flow overlay).

Preserves `computeEdgeGeometry()` function exactly — Bezier curve from bottom-center of source to top-center of target.

**Step 2: Implement `<edge-activity>`**

**Light DOM** — same reason.

Properties: `activeEdges` (from ActivityController).
Methods: `animateEdgeTravel(fromId, toId, preview)` — creates temp SVG path, traveling dot with glow filter, floating bubble. 800ms cubic ease-out. Bidirectional matching. Max 3 concurrent per edge.

**Step 3: Verify typecheck**

**Step 4: Commit**

```
feat: add SVG edge layer and activity animation components
```

---

### Task 9: Create coverflow dock with spring physics

**Files:**
- Create: `apps/desktop/src/renderer/canvas/components/coverflow-dock.ts`

**Step 1: Implement `<coverflow-dock>`**

Properties: `visible` (boolean).
Events: `platform-select` (dispatches when card clicked/Enter pressed).

Internal state: `cfActiveIndex`, `cfCurrentIndex` (float), `cfVelocity`, `cfAnimating`.

Spring physics (rAF loop):
```ts
private tick(): void {
  const STIFFNESS = 0.06;
  const DAMPING = 0.78;
  const force = (this.activeIndex - this.currentIndex) * STIFFNESS;
  this.velocity = (this.velocity + force) * DAMPING;
  this.currentIndex += this.velocity;

  if (Math.abs(this.currentIndex - this.activeIndex) < 0.002 && Math.abs(this.velocity) < 0.002) {
    this.currentIndex = this.activeIndex;
    this.velocity = 0;
    this.updateTransforms();
    return;
  }
  this.updateTransforms();
  requestAnimationFrame(() => this.tick());
}
```

3D transforms per card:
```ts
const translateX = offset * 100;
const translateZ = 60 - absOffset * 120;
const rotateY = absOffset < 0.01 ? 0 : -sign * Math.min(absOffset, 1.2) * 40;
const scale = Math.max(0.85, 1.08 - absOffset * 0.16);
const opacity = Math.max(0, 1 - absOffset * 0.3);
```

Scroll/wheel handler: accumulates delta, fires on threshold (50px). Arrow keys navigate. Enter/click selects.

**Step 2: Verify typecheck**

**Step 3: Commit**

```
feat: add coverflow dock component with spring physics
```

---

### Task 10: Create detail panels and conversation panel

**Files:**
- Create: `apps/desktop/src/renderer/canvas/components/agent-detail-panel.ts`
- Create: `apps/desktop/src/renderer/canvas/components/conversation-panel.ts`

**Step 1: Implement `<agent-detail-panel>`**

Properties: `node` (AgentNode | null).
Events: `close`, `node-update` (with patch).
Renders: right slide-in panel with:
- Identity section (avatar + name + platform)
- Role pills (lead, specialist, observer, coordinator, assistant)
- Autonomy segmented control (manual → full) with animated highlight
- Description input
- Instructions textarea + template button
- Response language select
- Behavior toggles (proactive, ownerResponse, peer)
- KPIs section (loaded via IPC)
- Integrations section (chips + add dropdown)

Auto-saves on every change via debounced IPC call.

**Step 2: Implement `<conversation-panel>`**

Properties: `open` (boolean), `feedMode` (boolean), `filterNodeId` (string | null).
Methods: `openEdgeConversation(fromId, toId)`, `openFeed()`.
Renders: sliding panel with participant header, filter pills, message bubbles, status indicator.

Message bubbles: left/right alignment based on sender, timestamp, action type badge.

**Step 3: Verify typecheck**

**Step 4: Commit**

```
feat: add agent detail panel and conversation panel components
```

---

### Task 11: Create orbital bubbles component

**Files:**
- Create: `apps/desktop/src/renderer/canvas/components/orbital-bubbles.ts`

**Step 1: Implement `<orbital-bubbles>`**

Properties: `nodeId` (string), `integrations` (string[]), `catalogMap` (Map).
Renders: floating integration icons orbiting around an agent card on hover.
Position: absolute, computed from card center + angle offset.
Hide/show with 150ms delay to prevent flicker.

**Step 2: Verify typecheck**

**Step 3: Commit**

```
feat: add orbital integration bubbles component
```

---

### Task 12: Create root `<sauria-canvas>` element

**Files:**
- Create: `apps/desktop/src/renderer/canvas/sauria-canvas.ts`

**Step 1: Implement root element**

The orchestrator: owns all controllers, provides context, composes child components.

```ts
@customElement('sauria-canvas')
export class SauriaCanvas extends LitElement {
  private graphSync = new GraphSyncController(this);
  private viewport = new ViewportController(this);
  private drag = new DragController(this);
  private activity = new ActivityController(this);

  async connectedCallback() {
    super.connectedCallback();
    await this.graphSync.init();
    this.activity.start();
  }

  render() {
    const { graph } = this.graphSync;
    const { zoom } = this.viewport;

    return html`
      <button class="palette-back" @click=${this.handleBack}>
        <img src="/icons/chevron-left.svg" alt="" />
      </button>

      <div class="canvas-viewport"
        @mousedown=${this.handleViewportMouseDown}
        @mousemove=${this.handleMouseMove}
        @mouseup=${this.handleMouseUp}
        @wheel=${this.handleWheel}>
        <div class="canvas-world" id="world">
          <edge-layer .edges=${graph.edges} .nodes=${graph.nodes}></edge-layer>
          <edge-activity></edge-activity>
          ${graph.workspaces.map(ws => html`
            <workspace-frame .workspace=${ws}
              ?selected=${ws.id === this.selectedWorkspaceId}
              .agentCount=${graph.nodes.filter(n => n.workspaceId === ws.id).length}
              @workspace-select=${this.handleWorkspaceSelect}>
            </workspace-frame>
          `)}
          ${graph.nodes.map(node => this.renderNode(node))}
        </div>
      </div>

      <canvas-empty-state .nodeCount=${graph.nodes.length}></canvas-empty-state>
      <canvas-toolbar .zoom=${zoom}
        @zoom-in=${() => this.viewport.setZoom(zoom + 0.1)}
        @zoom-out=${() => this.viewport.setZoom(zoom - 0.1)}
        @zoom-reset=${() => this.viewport.setZoom(1)}>
      </canvas-toolbar>

      <agent-detail-panel .node=${this.detailNode}
        @close=${this.closeAgentDetail}
        @node-update=${this.handleNodeUpdate}>
      </agent-detail-panel>

      <workspace-detail-panel .workspace=${this.detailWorkspace}
        @close=${this.closeWorkspaceDetail}
        @workspace-update=${this.handleWorkspaceUpdate}>
      </workspace-detail-panel>

      <conversation-panel .open=${this.convOpen}></conversation-panel>
      <workspace-dialog .open=${this.wsDialogOpen}
        @workspace-create=${this.handleWorkspaceCreate}
        @cancel=${() => this.wsDialogOpen = false}>
      </workspace-dialog>
      <confirm-dialog .open=${this.confirmOpen} .message=${this.confirmMessage}
        @confirm=${this.handleConfirm} @cancel=${() => this.confirmOpen = false}>
      </confirm-dialog>
      <coverflow-dock .visible=${this.dockVisible}
        @platform-select=${this.handlePlatformSelect}>
      </coverflow-dock>
      <canvas-legend .visible=${this.legendVisible}></canvas-legend>
      <button class="dock-toggle" @click=${this.toggleDock}>
        <img src="/icons/chevron-down.svg" alt="Toggle" />
      </button>
    `;
  }

  // Event handlers delegate to controllers
  private handleViewportMouseDown(e: MouseEvent) { /* viewport pan or node drag or ws drag */ }
  private handleMouseMove(e: MouseEvent) { this.drag.handleMouseMove(e); }
  private handleMouseUp(e: MouseEvent) { this.drag.handleMouseUp(e); }
  private handleWheel(e: WheelEvent) { /* zoom around cursor */ }
}
```

**Step 2: Verify typecheck**

**Step 3: Commit**

```
feat: add root sauria-canvas element composing all components
```

---

### Task 13: Wire root element into index.html

**Files:**
- Modify: `apps/desktop/src/renderer/canvas/index.html`

**Step 1: Replace index.html body**

Replace the entire body content with:
```html
<body>
  <sauria-canvas></sauria-canvas>
  <script type="module" src="./sauria-canvas.ts"></script>
</body>
```

Keep the `<head>` with shared.css and canvas.css imports.

**Step 2: Run Vite dev**

Run: `cd apps/desktop && pnpm run dev:vite`
Expected: Canvas view renders with all agent cards, edges, workspaces

**Step 3: Manual verification checklist**

- [ ] Agent cards render at correct positions
- [ ] Cards are draggable
- [ ] Edges render between connected nodes
- [ ] Zoom in/out works (CSS zoom, crisp rendering)
- [ ] Pan works (grab/drag viewport)
- [ ] Coverflow dock shows, spring physics works
- [ ] Platform card click creates setup card
- [ ] Credential form works, connect flow works
- [ ] Agent detail panel opens on gear click
- [ ] Workspace frames render with colored borders
- [ ] Add workspace dialog works
- [ ] Activity animations play (if daemon running)
- [ ] Empty state shows when no nodes
- [ ] Keyboard shortcuts (Delete, Cmd+/-, Cmd+0, D, Escape)
- [ ] Edge delete on hover works
- [ ] Conversation panel opens on edge click

**Step 4: Commit**

```
feat: mount sauria-canvas in index.html
```

---

### Task 14: Delete old main.ts and migrate CSS

**Files:**
- Delete: `apps/desktop/src/renderer/canvas/main.ts`
- Modify: `apps/desktop/src/renderer/canvas/canvas.css` (trim unused global styles)

**Step 1: Delete main.ts**

After verifying the Lit version works identically, remove the old file.

**Step 2: Audit canvas.css**

Move component-specific styles into their respective Shadow DOM `static styles`. Keep only:
- `.canvas-viewport` (global container)
- `.canvas-world` (transform target)
- Dot grid background
- Font face declarations

**Step 3: Full production build**

Run:
```bash
pnpm -r build
cd apps/desktop && pnpm run build
```
Expected: Build succeeds, `.app` bundle works

**Step 4: Verify line counts**

Run:
```bash
find apps/desktop/src/renderer/canvas -name '*.ts' -exec wc -l {} + | sort -n
```
Expected: Every file under 200 lines

**Step 5: Commit**

```
refactor: remove legacy canvas main.ts, scope CSS to components
```

---

### Task 15: Full integration test

**Step 1: Production build and install**

```bash
pkill -9 -f "sauria"; pkill -9 -f "Sauria"
pnpm -r build
cd apps/desktop && pnpm run build
rm -rf /Applications/Sauria.app
cp -R apps/desktop/src-tauri/target/release/bundle/macos/Sauria.app /Applications/Sauria.app
open /Applications/Sauria.app
```

**Step 2: Verify all functionality**

Same checklist as Task 13 Step 3, plus:
- [ ] Spring physics animation on dock is smooth
- [ ] Edge activity dots travel correctly (800ms, cubic ease-out)
- [ ] Bidirectional edge animation works (B→A on edge A→B)
- [ ] Node glow ring appears during activity
- [ ] Conversation panel shows live messages
- [ ] Activity feed mode works (badge count, filters)
- [ ] Orbital integration bubbles appear on hover
- [ ] Workspace lock/unlock works
- [ ] Workspace drag moves contained cards
- [ ] Owner node cannot be deleted
- [ ] i18n translations apply (`data-i18n` attributes)
- [ ] Back button navigates to palette view

**Step 3: Final commit**

```
feat: complete Lit Web Components migration for canvas
```

---

## Execution Notes

- **Order matters**: Tasks 1-4 are foundation (no visual output). Tasks 5-11 are independent leaf components (parallelizable). Task 12 wires everything. Tasks 13-15 are integration/cleanup.
- **Zero visual changes**: Every pixel, animation, timing, color must be identical. Compare screenshots before/after.
- **Shadow DOM exceptions**: `<edge-layer>` and `<edge-activity>` use Light DOM because SVG `viewBox` coordinates break across Shadow DOM boundaries.
- **CSS custom properties pierce Shadow DOM**: All design tokens (`var(--accent)`, `var(--card-bg)`, etc.) work inside Shadow DOM automatically.
- **Tauri IPC**: `invoke()` calls work identically in Lit components — they're just async functions.
- **i18n**: The `applyTranslations()` utility from `../i18n.js` won't work inside Shadow DOM. Either: (a) call `t()` directly in templates, or (b) use a LitElement lifecycle hook to translate after render. Recommend (a) — cleaner and reactive.
