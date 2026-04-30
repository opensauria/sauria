/**
 * Character movement system for the office view.
 *
 * Characters randomly walk to break room, other desks, or wander,
 * then return to their home desk. Movement is linear interpolation
 * between start and target positions.
 */

import type { OfficeLayout, DeskSlot, Room } from './office-types.js';

/** Walk speed: pixels per millisecond. */
const WALK_SPEED = 0.06;

/** Chance per tick (at ~60fps) that an idle character starts a walk. */
const WALK_CHANCE = 0.001;

/** Minimum ms before a character can walk again after returning home. */
const WALK_COOLDOWN_MS = 3000;

/** How long to linger at destination before heading home. */
const LINGER_MS = 2000;

interface WalkState {
  phase: 'idle' | 'going' | 'lingering' | 'returning';
  lingerStart: number;
  cooldownUntil: number;
}

const walkStates = new Map<string, WalkState>();

/** Initialize walk state for a slot if not already tracked. */
function getWalkState(slot: DeskSlot): WalkState {
  let state = walkStates.get(slot.agentId);
  if (!state) {
    state = { phase: 'idle', lingerStart: 0, cooldownUntil: 0 };
    walkStates.set(slot.agentId, state);
  }
  return state;
}

/**
 * Update all character positions for one frame.
 * Called once per rAF tick from office-canvas.
 */
export function updateMovement(
  layout: OfficeLayout,
  dt: number,
  now: number,
  activeNodeIds: ReadonlySet<string>,
): void {
  const allSlots = [...layout.rooms.flatMap((r) => r.desks), ...layout.lobby];

  for (const slot of allSlots) {
    // Active (typing) agents don't walk — they stay at their desk
    if (activeNodeIds.has(slot.agentId)) {
      returnHome(slot);
      continue;
    }

    const ws = getWalkState(slot);

    switch (ws.phase) {
      case 'idle':
        handleIdle(slot, ws, layout, now);
        break;
      case 'going':
        handleGoing(slot, ws, dt, now);
        break;
      case 'lingering':
        handleLingering(slot, ws, now);
        break;
      case 'returning':
        handleReturning(slot, ws, dt, now);
        break;
    }
  }
}

/* ── Phase handlers ──────────────────────────────────────────────────── */

function handleIdle(slot: DeskSlot, ws: WalkState, layout: OfficeLayout, now: number): void {
  if (now < ws.cooldownUntil) return;
  if (Math.random() > WALK_CHANCE) return;

  // Pick a random destination
  const target = pickDestination(slot, layout);
  if (!target) return;

  slot.targetX = target.x;
  slot.targetY = target.y;
  slot.walkStartX = slot.x;
  slot.walkStartY = slot.y;
  slot.walkProgress = 0;
  slot.animState = 'walking';
  ws.phase = 'going';
}

function handleGoing(slot: DeskSlot, ws: WalkState, dt: number, now: number): void {
  const dist = distance(slot.walkStartX, slot.walkStartY, slot.targetX, slot.targetY);
  if (dist < 1) {
    ws.phase = 'lingering';
    ws.lingerStart = now;
    slot.animState = 'idle';
    return;
  }

  slot.walkProgress += (dt * WALK_SPEED) / dist;
  if (slot.walkProgress >= 1) {
    slot.x = slot.targetX;
    slot.y = slot.targetY;
    slot.walkProgress = 1;
    ws.phase = 'lingering';
    ws.lingerStart = now;
    slot.animState = 'idle';
    return;
  }

  slot.x = lerp(slot.walkStartX, slot.targetX, slot.walkProgress);
  slot.y = lerp(slot.walkStartY, slot.targetY, slot.walkProgress);
  slot.animState = 'walking';
}

function handleLingering(slot: DeskSlot, ws: WalkState, now: number): void {
  if (now - ws.lingerStart < LINGER_MS) return;

  // Head back home
  slot.targetX = slot.homeX;
  slot.targetY = slot.homeY;
  slot.walkStartX = slot.x;
  slot.walkStartY = slot.y;
  slot.walkProgress = 0;
  slot.animState = 'walking';
  ws.phase = 'returning';
}

function handleReturning(slot: DeskSlot, ws: WalkState, dt: number, now: number): void {
  const dist = distance(slot.walkStartX, slot.walkStartY, slot.homeX, slot.homeY);
  if (dist < 1) {
    returnHome(slot);
    ws.phase = 'idle';
    ws.cooldownUntil = now + WALK_COOLDOWN_MS;
    return;
  }

  slot.walkProgress += (dt * WALK_SPEED) / dist;
  if (slot.walkProgress >= 1) {
    returnHome(slot);
    ws.phase = 'idle';
    ws.cooldownUntil = now + WALK_COOLDOWN_MS;
    return;
  }

  slot.x = lerp(slot.walkStartX, slot.homeX, slot.walkProgress);
  slot.y = lerp(slot.walkStartY, slot.homeY, slot.walkProgress);
  slot.animState = 'walking';
}

/* ── Walk to a specific agent (for interactions) ─────────────────────── */

export function walkToAgent(fromSlot: DeskSlot, toSlot: DeskSlot, now: number): void {
  const ws = getWalkState(fromSlot);
  if (ws.phase === 'going') return; // already walking

  // Walk to a position near the target agent
  fromSlot.targetX = toSlot.x + 32;
  fromSlot.targetY = toSlot.y;
  fromSlot.walkStartX = fromSlot.x;
  fromSlot.walkStartY = fromSlot.y;
  fromSlot.walkProgress = 0;
  fromSlot.animState = 'walking';
  ws.phase = 'going';
}

/* ── Destination picker ──────────────────────────────────────────────── */

function pickDestination(slot: DeskSlot, layout: OfficeLayout): { x: number; y: number } | null {
  const roll = Math.random();

  // 40% chance: go to break room
  if (roll < 0.4 && layout.breakRoom.width > 0) {
    return {
      x: layout.breakRoom.x + 20 + Math.random() * (layout.breakRoom.width - 60),
      y: layout.breakRoom.y + 20 + Math.random() * (layout.breakRoom.height - 60),
    };
  }

  // 40% chance: visit another agent's desk
  if (roll < 0.8) {
    const allSlots = [...layout.rooms.flatMap((r) => r.desks), ...layout.lobby];
    const others = allSlots.filter((s) => s.agentId !== slot.agentId);
    if (others.length > 0) {
      const target = others[Math.floor(Math.random() * others.length)];
      return { x: target.homeX + 32, y: target.homeY };
    }
  }

  // 20% chance: wander nearby
  return {
    x: slot.homeX + (Math.random() - 0.5) * 120,
    y: slot.homeY + (Math.random() - 0.5) * 80,
  };
}

/* ── Helpers ──────────────────────────────────────────────────────────── */

function returnHome(slot: DeskSlot): void {
  slot.x = slot.homeX;
  slot.y = slot.homeY;
  slot.walkProgress = 0;
}

function distance(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
