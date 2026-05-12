/**
 * Tile-based office renderer using LPC pixel art spritesheets.
 *
 * Floors are warm solid colors (reliable). Furniture from LPC tiles.
 * No floor spritesheet tiles (unreliable source rect mapping).
 */

import type { Room, DeskSlot, BuildingShell } from './office-types.js';
import { CHAR_W, CHAR_H } from './spritesheet.js';
import { TILES, drawTile } from './tileset.js';

export const SPRITE_SCALE = 4;
export const CHAR_SCREEN_W = CHAR_W * SPRITE_SCALE;
export const CHAR_SCREEN_H = CHAR_H * SPRITE_SCALE;

const FONT = "bold 11px -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif";
const ROOM_FONT = "bold 13px -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif";

/** Tile draw scale (32px source → 64px on screen). */
const S = 2;

/* ── Building ────────────────────────────────────────────────────────── */

export function drawBuilding(ctx: CanvasRenderingContext2D, b: BuildingShell): void {
  if (b.width === 0) return;

  // Drop shadow
  ctx.fillStyle = 'rgba(0,0,0,0.08)';
  ctx.fillRect(b.x + 4, b.y + 4, b.width, b.height);

  // Warm wood floor (solid color — reliable, looks good)
  ctx.fillStyle = '#c9ad87';
  ctx.fillRect(b.x, b.y, b.width, b.height);

  // Subtle plank lines
  ctx.strokeStyle = '#b89a7240';
  ctx.lineWidth = 1;
  for (let py = b.y + 24; py < b.y + b.height; py += 24) {
    ctx.beginPath();
    ctx.moveTo(b.x, py);
    ctx.lineTo(b.x + b.width, py);
    ctx.stroke();
  }

  // Top wall
  ctx.fillStyle = '#ddd0be';
  ctx.fillRect(b.x, b.y, b.width, 36);
  ctx.fillStyle = '#8d6e52';
  ctx.fillRect(b.x, b.y + 34, b.width, 2);

  // Wall decoration tiles
  drawTile(ctx, TILES.painting, b.x + 80, b.y + 2, S);
  drawTile(ctx, TILES.clock1, b.x + 320, b.y, S);
  drawTile(ctx, TILES.painting, b.x + 500, b.y + 2, S);
  drawTile(ctx, TILES.candles, b.x + 740, b.y + 4, S);
  drawTile(ctx, TILES.mirror, b.x + 880, b.y + 4, S);

  // Building outline
  ctx.strokeStyle = '#7a5e42';
  ctx.lineWidth = 3;
  ctx.strokeRect(b.x, b.y, b.width, b.height);
}

/* ── Room dispatcher ─────────────────────────────────────────────────── */

export function drawDepartment(ctx: CanvasRenderingContext2D, room: Room): void {
  switch (room.workspaceId) {
    case '__kitchen':
      drawKitchen(ctx, room);
      break;
    case '__meeting':
      drawMeetingRoom(ctx, room);
      break;
    case '__wc':
      drawWC(ctx, room);
      break;
    case '__lounge':
      drawLounge(ctx, room);
      break;
    case '__entrance':
      drawEntrance(ctx, room);
      break;
    case '__openspace':
      drawOpenSpace(ctx, room);
      break;
    default:
      break;
  }
}

/* ── Kitchen ─────────────────────────────────────────────────────────── */

function drawKitchen(ctx: CanvasRenderingContext2D, r: Room): void {
  // White tile floor
  ctx.fillStyle = '#e8e4de';
  ctx.fillRect(r.x, r.y, r.width, r.height);
  drawTileGridLines(ctx, r, '#d5d0c8');
  drawRoomBorder(ctx, r);
  drawRoomLabel(ctx, r);

  const { x, y } = r;
  drawTile(ctx, TILES.kitchenCounter, x + 8, y + 8, S);
  drawTile(ctx, TILES.kitchenCabinet, x + 80, y + 8, S);
  drawTile(ctx, TILES.stove, x + 8, y + 80, S);
  drawTile(ctx, TILES.shelf, x + 8, y + 160, S);
  drawTile(ctx, TILES.barrel, x + 150, y + 210, S);
  drawTile(ctx, TILES.tableRound, x + 80, y + 160, S);
  drawTile(ctx, TILES.chair, x + 64, y + 148, S);
  drawTile(ctx, TILES.chair, x + 152, y + 148, S);
}

/* ── Meeting Room ────────────────────────────────────────────────────── */

function drawMeetingRoom(ctx: CanvasRenderingContext2D, r: Room): void {
  // Subtle blue-gray carpet
  ctx.fillStyle = '#d5dce4';
  ctx.fillRect(r.x, r.y, r.width, r.height);
  drawRoomBorder(ctx, r);
  drawRoomLabel(ctx, r);

  const { x, y } = r;
  drawTile(ctx, TILES.deskLarge, x + 40, y + 80, S);
  drawTile(ctx, TILES.deskLarge, x + 40, y + 144, S);
  for (let i = 0; i < 3; i++) {
    drawTile(ctx, TILES.chair, x + 56 + i * 56, y + 56, S);
    drawTile(ctx, TILES.chair, x + 56 + i * 56, y + 212, S);
  }
  drawTile(ctx, TILES.bookcaseWide, x + r.width - 140, y + 8, S);
  drawTile(ctx, TILES.painting, x + 8, y + 8, S);
}

/* ── WC ──────────────────────────────────────────────────────────────── */

function drawWC(ctx: CanvasRenderingContext2D, r: Room): void {
  ctx.fillStyle = '#e8e4de';
  ctx.fillRect(r.x, r.y, r.width, r.height);
  drawTileGridLines(ctx, r, '#d5d0c8');
  drawRoomBorder(ctx, r);
  drawRoomLabel(ctx, r);

  const { x, y } = r;
  drawTile(ctx, TILES.mirror, x + 24, y + 8, S);
  drawTile(ctx, TILES.mirror, x + 96, y + 8, S);
  drawTile(ctx, TILES.pots, x + 16, y + 52, S);
  drawTile(ctx, TILES.pots, x + 88, y + 52, S);
  drawTile(ctx, TILES.cabinet, x + 12, y + 108, S);
  drawTile(ctx, TILES.cabinetSmall, x + 88, y + 108, S);
}

/* ── Lounge ──────────────────────────────────────────────────────────── */

function drawLounge(ctx: CanvasRenderingContext2D, r: Room): void {
  // Warm beige carpet
  ctx.fillStyle = '#e4d9cc';
  ctx.fillRect(r.x, r.y, r.width, r.height);
  drawRoomBorder(ctx, r);
  drawRoomLabel(ctx, r);

  const { x, y } = r;
  drawTile(ctx, TILES.benchLong, x + 16, y + 24, S);
  drawTile(ctx, TILES.benchLong, x + 16, y + 60, S);
  drawTile(ctx, TILES.tableSquare, x + 104, y + 64, S);
  drawTile(ctx, TILES.bookcase, x + r.width - 76, y + 8, S);
  drawTile(ctx, TILES.chest, x + r.width - 76, y + r.height - 48, S);
  drawTile(ctx, TILES.clock2, x + 8, y + 124, S);
}

/* ── Entrance ────────────────────────────────────────────────────────── */

function drawEntrance(ctx: CanvasRenderingContext2D, r: Room): void {
  // Darker warm floor
  ctx.fillStyle = '#b09878';
  ctx.fillRect(r.x, r.y, r.width, r.height);
  ctx.fillStyle = '#8d6e52';
  ctx.fillRect(r.x, r.y, r.width, 3);

  const { x, y } = r;
  drawTile(ctx, TILES.barrel, x + 24, y + 20, S);
  drawTile(ctx, TILES.barrel, x + r.width - 56, y + 20, S);
  drawTile(ctx, TILES.chest, x + 120, y + 24, S);
  drawTile(ctx, TILES.chest, x + r.width - 180, y + 24, S);
}

/* ── Open Space ──────────────────────────────────────────────────────── */

function drawOpenSpace(ctx: CanvasRenderingContext2D, r: Room): void {
  ctx.font = ROOM_FONT;
  ctx.fillStyle = '#8d6e5240';
  ctx.textAlign = 'center';
  ctx.fillText('Open Space', r.x + r.width / 2, r.y + 20);
}

/* ── Break Room (kitchen handles it) ─────────────────────────────────── */

export function drawBreakRoom(
  ctx: CanvasRenderingContext2D,
  _r: Room,
  _c: ImageBitmap | null,
  _w: ImageBitmap | null,
): void {}

/* ── Desk ─────────────────────────────────────────────────────────────── */

export function drawDesk(
  ctx: CanvasRenderingContext2D,
  slot: DeskSlot,
  _d: ImageBitmap | null,
  _m: ImageBitmap | null,
  _c: ImageBitmap | null,
  _cup: ImageBitmap | null,
): void {
  const baseY = slot.homeY + CHAR_SCREEN_H - 8;
  drawTile(ctx, TILES.chair, slot.homeX + 20, baseY - 24, S);
  drawTile(ctx, TILES.deskSmall, slot.homeX, baseY + 12, S);
}

/* ── Character overlay ───────────────────────────────────────────────── */

export function drawCharacter(
  ctx: CanvasRenderingContext2D,
  slot: DeskSlot,
  _bm: ImageBitmap | null,
  selectedId: string | null,
): void {
  if (selectedId === slot.agentId) {
    const cx = slot.x + CHAR_SCREEN_W / 2;
    const cy = slot.y + CHAR_SCREEN_H - 8;
    ctx.fillStyle = '#ffb30030';
    ctx.beginPath();
    ctx.ellipse(cx, cy, CHAR_SCREEN_W * 0.5, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffb300';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, CHAR_SCREEN_W * 0.45, 6, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  drawLabel(ctx, slot);
}

function drawLabel(ctx: CanvasRenderingContext2D, slot: DeskSlot): void {
  ctx.font = FONT;
  const text = slot.label;
  const w = Math.min(ctx.measureText(text).width + 14, CHAR_SCREEN_W + 36);
  const lx = slot.x + CHAR_SCREEN_W / 2;
  const ly = slot.y + CHAR_SCREEN_H + 12;
  ctx.fillStyle = 'rgba(26,18,10,0.75)';
  ctx.beginPath();
  ctx.roundRect(lx - w / 2, ly - 8, w, 16, 8);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, lx, ly, CHAR_SCREEN_W + 30);
  ctx.textBaseline = 'alphabetic';
}

/* ── Speech Bubble ───────────────────────────────────────────────────── */

export function drawSpeechBubble(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
): void {
  const maxW = 140;
  ctx.font = FONT;
  const mw = Math.min(ctx.measureText(text).width + 20, maxW);
  const bx = x - mw / 2;
  const by = y - 40;
  ctx.fillStyle = 'rgba(0,0,0,0.08)';
  ctx.beginPath();
  ctx.roundRect(bx + 2, by + 2, mw, 24, 8);
  ctx.fill();
  ctx.fillStyle = '#ffffffec';
  ctx.beginPath();
  ctx.roundRect(bx, by, mw, 24, 8);
  ctx.fill();
  ctx.fillStyle = '#ffffffec';
  ctx.beginPath();
  ctx.moveTo(x - 5, by + 24);
  ctx.lineTo(x, by + 30);
  ctx.lineTo(x + 5, by + 24);
  ctx.fill();
  ctx.fillStyle = '#3e2723';
  ctx.textAlign = 'center';
  ctx.fillText(text.length > 22 ? text.slice(0, 21) + '...' : text, x, by + 16, maxW - 16);
}

/* ── Helpers ──────────────────────────────────────────────────────────── */

function drawTileGridLines(ctx: CanvasRenderingContext2D, r: Room, color: string): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.5;
  for (let ty = r.y; ty < r.y + r.height; ty += 32) {
    ctx.beginPath();
    ctx.moveTo(r.x, ty);
    ctx.lineTo(r.x + r.width, ty);
    ctx.stroke();
  }
  for (let tx = r.x; tx < r.x + r.width; tx += 32) {
    ctx.beginPath();
    ctx.moveTo(tx, r.y);
    ctx.lineTo(tx, r.y + r.height);
    ctx.stroke();
  }
}

function drawRoomBorder(ctx: CanvasRenderingContext2D, r: Room): void {
  ctx.strokeStyle = '#7a5e42';
  ctx.lineWidth = 2;
  ctx.strokeRect(r.x, r.y, r.width, r.height);
}

function drawRoomLabel(ctx: CanvasRenderingContext2D, r: Room): void {
  ctx.font = ROOM_FONT;
  const w = ctx.measureText(r.name).width + 16;
  const lx = r.x + r.width / 2;
  const ly = r.y - 4;
  ctx.fillStyle = r.color + '40';
  ctx.beginPath();
  ctx.roundRect(lx - w / 2, ly - 14, w, 18, 4);
  ctx.fill();
  ctx.fillStyle = '#4e342e';
  ctx.textAlign = 'center';
  ctx.fillText(r.name, lx, ly - 1);
}
