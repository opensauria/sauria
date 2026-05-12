/**
 * Spritesheet loader — loads real PNG character sprites.
 *
 * Uses the "24x32 Characters with Faces" pack by Svetlana Kushnariova
 * (CC-BY 3.0, OpenGameArt.org).
 *
 * Each PNG is 153x128 with this layout:
 *   Left 3 columns: walk frames (24x32 each)
 *     Row 0: walk down  (3 frames)
 *     Row 1-3: walk left/right/up
 *   Right side: face portrait (ignored)
 *
 * Characters are assigned per-agent (not per-platform) so each agent
 * gets a unique sprite even when multiple agents share the same platform.
 */

/** Character frame dimensions (native sprite pixels). */
export const CHAR_W = 24;
export const CHAR_H = 32;

/** Frames per walk cycle. */
export const WALK_FRAMES = 3;

const BASE = '/sprites/24x32-characters-big-pack-by-Svetlana-Kushnariova';

/**
 * Pool of ALL visually distinct character sprites.
 * Ordered so adjacent indices look maximally different.
 */
const SPRITE_POOL: readonly string[] = [
  `${BASE}/NPC/King_01.png`,
  `${BASE}/NPC/Dancer-F-01.png`,
  `${BASE}/Heroes/Mage-M-01.png`,
  `${BASE}/NPC/Aristocrate-F-01.png`,
  `${BASE}/NPC/Pirate-F-01.png`,
  `${BASE}/Heroes/Fighter-M-01.png`,
  `${BASE}/Heroes/Healer-F-01.png`,
  `${BASE}/NPC/Bard-M-01.png`,
  `${BASE}/Heroes/Ranger-F-01.png`,
  `${BASE}/NPC/Princess-01.png`,
  `${BASE}/NPC/Prince-01.png`,
  `${BASE}/Heroes/Fighter-F-02.png`,
  `${BASE}/NPC/Townfolk-Adult-F-001.png`,
  `${BASE}/Heroes/Mage-F-01.png`,
  `${BASE}/NPC/Townfolk-Adult-M-001.png`,
  `${BASE}/Heroes/Ranger-M-01.png`,
  `${BASE}/NPC/Aristocrate-F-02.png`,
  `${BASE}/Heroes/Healer-M-01.png`,
  `${BASE}/NPC/Snow-M-01.png`,
  `${BASE}/NPC/Townfolk-Adult-F-002.png`,
];

/** Loaded sprite images by pool index. */
const pool: (HTMLImageElement | null)[] = [];

/** Agent ID → pool index assignment. */
const agentAssignments = new Map<string, number>();
let nextPoolIndex = 0;

/** Load all sprites from the pool. Call once at init. */
export async function loadAllSprites(): Promise<void> {
  await Promise.all(
    SPRITE_POOL.map(
      (src, i) =>
        new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => {
            pool[i] = img;
            resolve();
          };
          img.onerror = () => {
            pool[i] = null;
            resolve();
          };
          img.src = src;
        }),
    ),
  );
}

/**
 * Get the sprite image for a specific agent.
 * Each agent gets a unique sprite assigned on first call.
 */
export function getSpriteImage(_platform: string, agentId?: string): HTMLImageElement | null {
  if (!agentId) return pool[0] ?? null;

  let idx = agentAssignments.get(agentId);
  if (idx === undefined) {
    idx = nextPoolIndex % SPRITE_POOL.length;
    nextPoolIndex++;
    agentAssignments.set(agentId, idx);
  }

  return pool[idx] ?? pool[0] ?? null;
}

/** Draw a character frame from a sprite image. */
export function drawSpriteFrame(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  frameIndex: number,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
): void {
  const sx = (frameIndex % WALK_FRAMES) * CHAR_W;
  const sy = 0; // row 0 = walk down (front-facing)
  ctx.drawImage(img, sx, sy, CHAR_W, CHAR_H, dx, dy, dw, dh);
}
