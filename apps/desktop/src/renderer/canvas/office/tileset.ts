/**
 * LPC tileset loader and tile coordinate mapping.
 *
 * Loads the LPC interior, furniture, and floor spritesheets.
 * All tiles are 32x32 pixels in the source spritesheets.
 *
 * IMPORTANT: Source rect coordinates are carefully verified against
 * the actual PNG files. Do not change without visual verification.
 */

const TILE = 32;

const PATHS = {
  interior: '/sprites/lpc-interior/LPC_house_interior/interior.png',
  furniture: '/sprites/lpc-furniture/blonde-wood.png',
  floors: '/sprites/lpc-floors/lpc-floors/floors.png',
} as const;

const images: Record<string, HTMLImageElement> = {};

export async function loadTilesets(): Promise<void> {
  await Promise.all(
    Object.entries(PATHS).map(
      ([key, src]) =>
        new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => {
            images[key] = img;
            resolve();
          };
          img.onerror = () => resolve();
          img.src = src;
        }),
    ),
  );
}

export function getTileset(name: string): HTMLImageElement | null {
  return images[name] ?? null;
}

export interface TileRect {
  readonly sheet: string;
  readonly sx: number;
  readonly sy: number;
  readonly sw: number;
  readonly sh: number;
}

/** Define a tile by pixel coordinates (safer than grid math). */
function px(sheet: string, sx: number, sy: number, sw: number, sh: number): TileRect {
  return { sheet, sx, sy, sw, sh };
}

/** Define a tile by grid position (col, row) with tile-unit width/height. */
function t(sheet: string, col: number, row: number, w = 1, h = 1): TileRect {
  return { sheet, sx: col * TILE, sy: row * TILE, sw: w * TILE, sh: h * TILE };
}

/* ── Verified tile source rects ──────────────────────────────────────── */

export const TILES = {
  /*
   * interior.png (512x512) — furniture & decorations
   * Visually verified positions:
   */
  painting: px('interior', 0, 0, 96, 64), // large painting (3x2 tiles)
  mirror: px('interior', 96, 32, 32, 32), // small mirror
  candles: px('interior', 192, 32, 32, 32), // candelabra
  kitchenCounter: px('interior', 0, 96, 64, 32), // counter top
  kitchenCabinet: px('interior', 64, 96, 64, 64), // cabinet
  stove: px('interior', 128, 96, 64, 64), // stove
  shelf: px('interior', 0, 160, 64, 64), // shelf with items
  shelfBooks: px('interior', 64, 160, 64, 64), // bookshelf
  barrel: px('interior', 0, 224, 32, 32), // barrel
  chest: px('interior', 64, 224, 64, 32), // chest
  clock1: px('interior', 0, 256, 32, 64), // wall clock
  clock2: px('interior', 32, 256, 32, 64), // pendulum clock
  pots: px('interior', 192, 64, 64, 32), // pots on counter
  fireplace: px('interior', 384, 96, 96, 96), // fireplace

  /*
   * blonde-wood.png (512x1024) — wooden furniture
   * Visually verified positions:
   */
  deskWithItems: t('furniture', 0, 0, 4, 2), // desk with stuff (128x64)
  deskLarge: t('furniture', 0, 2, 4, 1), // large desk surface (128x32)
  deskSmall: px('furniture', 0, 128, 64, 32), // small desk
  tableRound: px('furniture', 256, 128, 64, 64), // round table
  tableSquare: px('furniture', 128, 128, 64, 64), // square table
  chair: px('furniture', 320, 128, 32, 32), // chair
  stool: px('furniture', 352, 128, 32, 32), // stool
  benchLong: px('furniture', 0, 160, 128, 32), // long bench
  bookcase: px('furniture', 128, 192, 64, 96), // tall bookcase
  bookcaseWide: px('furniture', 192, 192, 128, 96), // wide bookcase
  cabinet: px('furniture', 0, 192, 64, 96), // tall cabinet
  cabinetSmall: px('furniture', 64, 192, 64, 96), // narrow cabinet

  /*
   * floors.png (1024x2048) — floor tiles
   * Row 0 has carpet squares. We use a simple wood tone for floors.
   * The wood patterns start around row 14-16 in the sheet.
   */
  woodFloor: px('floors', 0, 896, 64, 64), // warm wood parquet
  tileFloor: px('floors', 256, 0, 64, 64), // simple tile
  carpetPlain: px('floors', 128, 0, 64, 64), // subtle carpet
} as const;

/** Draw a single tile from a spritesheet. */
export function drawTile(
  ctx: CanvasRenderingContext2D,
  tile: TileRect,
  dx: number,
  dy: number,
  scale = 1,
): void {
  const img = images[tile.sheet];
  if (!img) return;
  ctx.drawImage(img, tile.sx, tile.sy, tile.sw, tile.sh, dx, dy, tile.sw * scale, tile.sh * scale);
}

/** Fill an area by repeating a tile. */
export function fillTile(
  ctx: CanvasRenderingContext2D,
  tile: TileRect,
  x: number,
  y: number,
  w: number,
  h: number,
  scale = 1,
): void {
  const img = images[tile.sheet];
  if (!img) return;
  const tw = tile.sw * scale;
  const th = tile.sh * scale;
  for (let ty = y; ty < y + h; ty += th) {
    for (let tx = x; tx < x + w; tx += tw) {
      const dw = Math.min(tw, x + w - tx);
      const dh = Math.min(th, y + h - ty);
      ctx.drawImage(img, tile.sx, tile.sy, (dw / scale) | 0, (dh / scale) | 0, tx, ty, dw, dh);
    }
  }
}
