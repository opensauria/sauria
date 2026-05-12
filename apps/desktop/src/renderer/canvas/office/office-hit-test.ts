/**
 * Hit-test for clicking on characters in the office view.
 */

import type { OfficeLayout, DeskSlot } from './office-types.js';
import { CHAR_SCREEN_W, CHAR_SCREEN_H } from './office-renderer.js';

/** Extra padding around hit box for easier clicking. */
const HIT_PADDING = 8;

export function hitTestAgent(worldX: number, worldY: number, layout: OfficeLayout): string | null {
  for (const room of layout.rooms) {
    const hit = hitTestSlots(worldX, worldY, room.desks);
    if (hit) return hit;
  }
  return hitTestSlots(worldX, worldY, layout.lobby);
}

function hitTestSlots(wx: number, wy: number, slots: readonly DeskSlot[]): string | null {
  for (const slot of slots) {
    if (
      wx >= slot.x - HIT_PADDING &&
      wx <= slot.x + CHAR_SCREEN_W + HIT_PADDING &&
      wy >= slot.y - HIT_PADDING &&
      wy <= slot.y + CHAR_SCREEN_H + HIT_PADDING
    ) {
      return slot.agentId;
    }
  }
  return null;
}
