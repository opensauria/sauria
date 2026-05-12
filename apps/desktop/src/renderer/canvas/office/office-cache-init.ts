/**
 * Cache initialization helpers for the office view.
 *
 * Prepares static sprites (furniture, floor, walls) and dynamic
 * per-platform character sprites into the SpriteCache.
 */

import type { DeskSlot, SpriteFrame } from './office-types.js';
import { FURNITURE_PALETTE, FLOOR_PALETTE, WALL_PALETTE } from './office-palette.js';
import { buildCharacterPalette, characterPaletteToArray } from './office-palette.js';
import { DESK, MONITOR, CHAIR, PLANT, FLOOR_TILE, WALL_H, WALL_V } from './office-sprites.js';
import { BOOKSHELF, WHITEBOARD, POTTED_FLOWER, COFFEE_CUP } from './office-sprites.js';
import { PLATFORM_IDLE, CHARACTER_TYPING } from './office-sprites.js';
import { SpriteCache } from './office-sprite-cache.js';

/** Prepare all static (non-character) sprites into the cache. */
export async function prepareStaticSprites(cache: SpriteCache): Promise<void> {
  await cache.prepareBatch([
    { key: SpriteCache.key('floor', 'default'), frame: FLOOR_TILE, palette: FLOOR_PALETTE },
    { key: SpriteCache.key('wall-h', 'default'), frame: WALL_H, palette: WALL_PALETTE },
    { key: SpriteCache.key('wall-v', 'default'), frame: WALL_V, palette: WALL_PALETTE },
    { key: SpriteCache.key('desk', 'default'), frame: DESK, palette: FURNITURE_PALETTE },
    { key: SpriteCache.key('monitor', 'default'), frame: MONITOR, palette: FURNITURE_PALETTE },
    { key: SpriteCache.key('chair', 'default'), frame: CHAIR, palette: FURNITURE_PALETTE },
    { key: SpriteCache.key('plant', 'default'), frame: PLANT, palette: FURNITURE_PALETTE },
    { key: SpriteCache.key('bookshelf', 'default'), frame: BOOKSHELF, palette: FURNITURE_PALETTE },
    {
      key: SpriteCache.key('whiteboard', 'default'),
      frame: WHITEBOARD,
      palette: FURNITURE_PALETTE,
    },
    {
      key: SpriteCache.key('potted-flower', 'default'),
      frame: POTTED_FLOWER,
      palette: FURNITURE_PALETTE,
    },
    {
      key: SpriteCache.key('coffee-cup', 'default'),
      frame: COFFEE_CUP,
      palette: FURNITURE_PALETTE,
    },
  ]);
}

/** Prepare character sprites for all desk slots (per-platform unique designs). */
export async function prepareCharacterSprites(
  cache: SpriteCache,
  slots: readonly DeskSlot[],
): Promise<void> {
  const seen = new Set<string>();
  const entries: { key: string; frame: SpriteFrame; palette: readonly string[] }[] = [];

  for (const slot of slots) {
    const palette = buildCharacterPalette(slot.platform, null);
    const paletteArr = characterPaletteToArray(palette);
    const paletteHash = SpriteCache.hashPalette(paletteArr);

    // Per-platform idle frames
    const idleFrames = PLATFORM_IDLE[slot.platform] ?? PLATFORM_IDLE.owner;
    for (let i = 0; i < idleFrames.length; i++) {
      const key = SpriteCache.key(`char-${slot.platform}-${i}`, paletteHash);
      if (!seen.has(key)) {
        seen.add(key);
        entries.push({ key, frame: idleFrames[i], palette: paletteArr });
      }
    }

    // Shared typing frames
    for (let i = 0; i < CHARACTER_TYPING.length; i++) {
      const key = SpriteCache.key(`char-typing-${i}`, paletteHash);
      if (!seen.has(key)) {
        seen.add(key);
        entries.push({ key, frame: CHARACTER_TYPING[i], palette: paletteArr });
      }
    }
  }

  await cache.prepareBatch(entries);
}
