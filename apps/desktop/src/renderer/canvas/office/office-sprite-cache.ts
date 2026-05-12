/**
 * Sprite cache: renders palette-indexed sprite data to OffscreenCanvas,
 * then caches as ImageBitmap for instant drawImage() calls.
 */

import type { SpriteFrame } from './office-types.js';

export class SpriteCache {
  private readonly cache = new Map<string, ImageBitmap>();

  /**
   * Get a cached bitmap for the given sprite + palette combo.
   * Returns undefined if not yet cached — call `prepare()` first.
   */
  get(key: string): ImageBitmap | undefined {
    return this.cache.get(key);
  }

  /** Build a cache key from sprite id and palette. */
  static key(spriteId: string, paletteHash: string): string {
    return `${spriteId}:${paletteHash}`;
  }

  /** Hash a palette array into a short string for cache keying. */
  static hashPalette(palette: readonly string[]): string {
    let h = 0;
    for (const c of palette) {
      for (let i = 0; i < c.length; i++) {
        h = ((h << 5) - h + c.charCodeAt(i)) | 0;
      }
    }
    return h.toString(36);
  }

  /**
   * Render a sprite frame with the given palette and cache the result.
   * If already cached, this is a no-op.
   */
  async prepare(key: string, frame: SpriteFrame, palette: readonly string[]): Promise<ImageBitmap> {
    const existing = this.cache.get(key);
    if (existing) return existing;

    const canvas = new OffscreenCanvas(frame.width, frame.height);
    const ctx = canvas.getContext('2d')!;

    renderFrameToContext(ctx, frame, palette);

    const bitmap = await createImageBitmap(canvas);
    this.cache.set(key, bitmap);
    return bitmap;
  }

  /**
   * Synchronous prepare using putImageData (no async createImageBitmap).
   * Returns the OffscreenCanvas directly for immediate use.
   */
  prepareSync(key: string, frame: SpriteFrame, palette: readonly string[]): OffscreenCanvas {
    const canvas = new OffscreenCanvas(frame.width, frame.height);
    const ctx = canvas.getContext('2d')!;

    renderFrameToContext(ctx, frame, palette);
    return canvas;
  }

  /** Prepare multiple sprites in a batch. */
  async prepareBatch(
    entries: readonly { key: string; frame: SpriteFrame; palette: readonly string[] }[],
  ): Promise<void> {
    const promises = entries
      .filter((e) => !this.cache.has(e.key))
      .map((e) => this.prepare(e.key, e.frame, e.palette));
    await Promise.all(promises);
  }

  /** Clear all cached bitmaps, freeing GPU memory. */
  clear(): void {
    for (const bitmap of this.cache.values()) {
      bitmap.close();
    }
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

/* ── Helpers ──────────────────────────────────────────────────────────── */

function renderFrameToContext(
  ctx: OffscreenCanvasRenderingContext2D,
  frame: SpriteFrame,
  palette: readonly string[],
): void {
  for (let y = 0; y < frame.height; y++) {
    const row = frame.pixels[y];
    if (!row) continue;
    for (let x = 0; x < frame.width; x++) {
      const idx = row[x];
      if (!idx) continue; // 0 = transparent
      const color = palette[idx];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1, 1);
    }
  }
}
