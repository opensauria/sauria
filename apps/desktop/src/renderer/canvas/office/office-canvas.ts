/**
 * <office-canvas> — Pixel art office view using spritesheet rendering.
 *
 * Characters are rendered from a single spritesheet bitmap (generated at init),
 * using drawImage() with source rects — identical to how real 2D games work.
 * Furniture bitmaps are also pre-generated and cached.
 */

import { html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { LightDomElement } from '../light-dom-element.js';
import type { ViewportController } from '../controllers/viewport-controller.js';
import type { CanvasGraph } from '../types.js';
import type { AgentInteraction, DeskSlot, OfficeLayout } from './office-types.js';
import { mapGraphToOfficeLayout } from './office-layout.js';
import {
  drawBuilding,
  drawDepartment,
  drawBreakRoom,
  drawDesk,
  drawCharacter,
  drawSpeechBubble,
  CHAR_SCREEN_W,
  CHAR_SCREEN_H,
  SPRITE_SCALE,
} from './office-renderer.js';
import { hitTestAgent } from './office-hit-test.js';
import { updateMovement, walkToAgent } from './office-movement.js';
import { fire } from '../fire.js';
import {
  loadAllSprites,
  getSpriteImage,
  drawSpriteFrame,
  CHAR_W,
  CHAR_H,
  WALK_FRAMES,
} from './spritesheet.js';
import { loadTilesets } from './tileset.js';

const IDLE_FRAME_MS = 800;
const TYPING_FRAME_MS = 400;
const INTERACTION_DURATION_MS = 4000;

@customElement('office-canvas')
export class OfficeCanvas extends LightDomElement {
  @property({ attribute: false }) graph!: CanvasGraph;
  @property({ attribute: false }) activeNodeIds: ReadonlySet<string> = new Set();
  @property({ attribute: false }) selectedNodeId: string | null = null;
  @property({ attribute: false }) viewportController!: ViewportController;

  private readonly interactions: AgentInteraction[] = [];
  private layout: OfficeLayout = {
    rooms: [],
    lobby: [],
    building: { x: 0, y: 0, width: 0, height: 0 },
    breakRoom: {
      workspaceId: '__break',
      name: '',
      color: '',
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      desks: [],
    },
    floorWidth: 0,
    floorHeight: 0,
  };

  // Agent photo avatars (loaded from node.photo URLs)
  private photoCache = new Map<string, HTMLImageElement>();

  private rafId = 0;
  private animClock = 0;
  private lastFrameTime = 0;

  render() {
    return html`
      <div
        class="office-viewport"
        @mousedown=${this.handleMouseDown}
        @wheel=${this.handleWheel}
        @click=${this.handleClick}
      >
        <canvas class="office-canvas"></canvas>
      </div>
    `;
  }

  async connectedCallback(): Promise<void> {
    super.connectedCallback();
    await this.initAssets();
    this.startLoop();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    cancelAnimationFrame(this.rafId);
    // Sprite images are shared singletons, no cleanup needed
  }

  updated(): void {
    this.layout = mapGraphToOfficeLayout(this.graph);
    this.loadPhotos();
  }

  private loadPhotos(): void {
    for (const slot of this.getAllSlots()) {
      if (!slot.photo || this.photoCache.has(slot.agentId)) continue;
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => this.photoCache.set(slot.agentId, img);
      img.src = slot.photo;
    }
  }

  notifyInteraction(fromId: string, toId: string, preview: string): void {
    const exists = this.interactions.some(
      (i) => (i.fromId === fromId && i.toId === toId) || (i.fromId === toId && i.toId === fromId),
    );
    if (exists) return;
    this.interactions.push({
      fromId,
      toId,
      preview: preview || '...',
      startedAt: performance.now(),
      durationMs: INTERACTION_DURATION_MS,
    });
    const allSlots = this.getAllSlots();
    const fromSlot = allSlots.find((s) => s.agentId === fromId);
    const toSlot = allSlots.find((s) => s.agentId === toId);
    if (fromSlot && toSlot) walkToAgent(fromSlot, toSlot, performance.now());
  }

  /* ── Asset loading (like a real game) ──────────────────────────────── */

  private async initAssets(): Promise<void> {
    await Promise.all([loadAllSprites(), loadTilesets()]);
  }

  /* ── Render loop ───────────────────────────────────────────────────── */

  private startLoop(): void {
    this.lastFrameTime = performance.now();
    this.tick(this.lastFrameTime);
  }

  private tick = (timestamp: number): void => {
    const dt = timestamp - this.lastFrameTime;
    this.lastFrameTime = timestamp;
    this.animClock += dt;

    updateMovement(this.layout, dt, timestamp, this.activeNodeIds);
    this.pruneInteractions(timestamp);
    this.updateAnimStates();
    this.drawFrame(timestamp);

    this.rafId = requestAnimationFrame(this.tick);
  };

  private updateAnimStates(): void {
    for (const slot of this.getAllSlots()) {
      if (slot.animState === 'walking') {
        slot.frameIndex = Math.floor(this.animClock / 300) % 2;
      } else if (this.activeNodeIds.has(slot.agentId)) {
        slot.animState = 'typing';
        slot.frameIndex = Math.floor(this.animClock / TYPING_FRAME_MS) % 2;
      } else {
        slot.animState = 'idle';
        slot.frameIndex = Math.floor(this.animClock / IDLE_FRAME_MS) % 2;
      }
    }
  }

  private pruneInteractions(now: number): void {
    for (let i = this.interactions.length - 1; i >= 0; i--) {
      if (now - this.interactions[i].startedAt > this.interactions[i].durationMs) {
        this.interactions.splice(i, 1);
      }
    }
  }

  private drawFrame(now: number): void {
    const canvas = this.querySelector('.office-canvas') as HTMLCanvasElement | null;
    if (!canvas) return;

    const rect = canvas.parentElement!.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const vp = this.viewportController;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.translate(vp.x, vp.y);
    ctx.scale(vp.zoom, vp.zoom);
    ctx.imageSmoothingEnabled = false;

    drawBuilding(ctx, this.layout.building);

    for (const dept of this.layout.rooms) drawDepartment(ctx, dept);
    drawBreakRoom(ctx, this.layout.breakRoom, null, null);

    // Y-sorted rendering (back to front)
    const sorted = [...this.getAllSlots()].sort((a, b) => a.y - b.y);
    for (const slot of sorted) {
      drawDesk(ctx, slot, null, null, null, null);
      this.drawCharFromSheet(ctx, slot);
    }

    this.drawInteractions(ctx, sorted, now);
    ctx.restore();
  }

  /** Draw a character from their platform's loaded PNG sprite + photo avatar. */
  private drawCharFromSheet(ctx: CanvasRenderingContext2D, slot: DeskSlot): void {
    const img = getSpriteImage(slot.platform, slot.agentId);
    if (img) {
      // Idle/typing = frame 1 (standing neutral), walking = cycle 0-1-2
      const frame = slot.animState === 'walking' ? slot.frameIndex % WALK_FRAMES : 1;
      drawSpriteFrame(ctx, img, frame, slot.x, slot.y, CHAR_SCREEN_W, CHAR_SCREEN_H);
    }

    // Photo avatar floating above character head
    this.drawPhotoAvatar(ctx, slot);

    // Selection ring + name label
    drawCharacter(ctx, slot, null, this.selectedNodeId);
  }

  /** Draw the agent's profile photo as a circular avatar above their sprite. */
  private drawPhotoAvatar(ctx: CanvasRenderingContext2D, slot: DeskSlot): void {
    const photo = this.photoCache.get(slot.agentId);
    if (!photo) return;

    const radius = 16;
    const cx = slot.x + CHAR_SCREEN_W / 2;
    const cy = slot.y - radius - 4;

    // White border ring
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 2, 0, Math.PI * 2);
    ctx.fill();

    // Clip to circle and draw photo
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(photo, cx - radius, cy - radius, radius * 2, radius * 2);
    ctx.restore();
  }

  private drawInteractions(
    ctx: CanvasRenderingContext2D,
    allSlots: readonly DeskSlot[],
    now: number,
  ): void {
    for (const interaction of this.interactions) {
      const elapsed = now - interaction.startedAt;
      const fade =
        elapsed > interaction.durationMs - 800 ? (interaction.durationMs - elapsed) / 800 : 1;
      if (fade <= 0) continue;
      ctx.globalAlpha = Math.max(0, Math.min(1, fade));
      const fromSlot = allSlots.find((s) => s.agentId === interaction.fromId);
      if (fromSlot) {
        drawSpeechBubble(ctx, fromSlot.x + CHAR_SCREEN_W / 2, fromSlot.y - 4, interaction.preview);
      }
      ctx.globalAlpha = 1;
    }
  }

  /* ── Input handlers ────────────────────────────────────────────────── */

  private handleClick = (e: MouseEvent): void => {
    const canvas = this.querySelector('.office-canvas') as HTMLCanvasElement | null;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const world = this.viewportController.screenToWorld(
      e.clientX - rect.left,
      e.clientY - rect.top,
    );
    const agentId = hitTestAgent(world.x, world.y, this.layout);
    if (agentId) fire(this, 'agent-select', { agentId });
  };

  private handleWheel = (e: WheelEvent): void => this.viewportController.handleWheel(e);

  private handleMouseDown = (e: MouseEvent): void => {
    if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
      this.viewportController.startPan(e);
      const el = e.currentTarget as HTMLElement;
      el.classList.add('panning');
      const onUp = (): void => {
        this.viewportController.stopPan();
        el.classList.remove('panning');
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mouseup', onUp);
    }
  };

  private getAllSlots(): DeskSlot[] {
    return [...this.layout.rooms.flatMap((r) => r.desks), ...this.layout.lobby];
  }
}
