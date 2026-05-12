/**
 * Procedural character sprite generator.
 *
 * Generates high-quality character bitmaps by compositing Canvas 2D layers:
 * body → skin shading → hair → clothing → face → accessories → outline.
 *
 * Light direction: top-left (consistent Stardew Valley style).
 * Each platform gets a unique silhouette (hair shape + clothing style).
 */

import type { CharacterPalette } from './office-types.js';

/** Character sprite dimensions (source pixels, before scale). */
const W = 24;
const H = 36;

export { W as CHAR_SRC_W, H as CHAR_SRC_H };

/** Hair shape definition per platform. */
interface HairDef {
  draw: (ctx: OffscreenCanvasRenderingContext2D, p: CharacterPalette) => void;
}

/** Clothing definition per platform. */
interface ClothingDef {
  draw: (ctx: OffscreenCanvasRenderingContext2D, p: CharacterPalette) => void;
}

/** Accessory overlay per platform. */
interface AccessoryDef {
  draw: (ctx: OffscreenCanvasRenderingContext2D, p: CharacterPalette) => void;
}

/* ── Main generator ──────────────────────────────────────────────────── */

export function generateCharacter(
  platform: string,
  palette: CharacterPalette,
  frameIndex: number,
  isTyping: boolean,
): OffscreenCanvas {
  const canvas = new OffscreenCanvas(W, H);
  const ctx = canvas.getContext('2d')!;

  const sway = isTyping ? 0 : frameIndex % 2 === 0 ? 0 : 0.5;

  // Body base
  drawBody(ctx, palette, sway, isTyping);

  // Clothing
  const clothing = CLOTHING_MAP[platform] ?? CLOTHING_MAP.owner;
  clothing.draw(ctx, palette);

  // Hair (on top of body/clothing at head position)
  const hair = HAIR_MAP[platform] ?? HAIR_MAP.owner;
  hair.draw(ctx, palette);

  // Face
  drawFace(ctx, palette, sway);

  // Accessories
  const acc = ACCESSORY_DEFS[platform];
  if (acc) acc.draw(ctx, palette);

  // Outline pass (darken edges)
  applyOutline(ctx, palette.outline);

  return canvas;
}

/* ── Body ─────────────────────────────────────────────────────────────── */

function drawBody(
  ctx: OffscreenCanvasRenderingContext2D,
  p: CharacterPalette,
  sway: number,
  isTyping: boolean,
): void {
  const cx = W / 2 + sway;

  // Head (oval)
  ctx.fillStyle = p.skin;
  ctx.beginPath();
  ctx.ellipse(cx, 10, 5.5, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  // Skin shadow (right side, bottom)
  const grad = ctx.createRadialGradient(cx - 2, 8, 1, cx, 10, 6);
  grad.addColorStop(0, 'transparent');
  grad.addColorStop(1, p.skinShadow + '80');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(cx, 10, 5.5, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  // Neck
  ctx.fillStyle = p.skinShadow;
  ctx.fillRect(cx - 2, 15, 4, 2);

  // Torso
  ctx.fillStyle = p.shirt;
  ctx.beginPath();
  ctx.moveTo(cx - 6, 17);
  ctx.lineTo(cx + 6, 17);
  ctx.lineTo(cx + 5, 27);
  ctx.lineTo(cx - 5, 27);
  ctx.closePath();
  ctx.fill();

  // Arms
  ctx.fillStyle = p.skin;
  if (isTyping) {
    // Arms forward (typing)
    ctx.fillRect(cx - 8, 20, 3, 6);
    ctx.fillRect(cx + 5, 20, 3, 6);
  } else {
    // Arms at sides
    ctx.fillRect(cx - 8, 18, 3, 8);
    ctx.fillRect(cx + 5, 18, 3, 8);
  }

  // Hands
  ctx.fillStyle = p.skin;
  const handY = isTyping ? 25 : 26;
  ctx.beginPath();
  ctx.arc(cx - 7, handY, 1.5, 0, Math.PI * 2);
  ctx.arc(cx + 7, handY, 1.5, 0, Math.PI * 2);
  ctx.fill();

  // Legs
  ctx.fillStyle = p.pants;
  ctx.fillRect(cx - 4, 27, 3, 6);
  ctx.fillRect(cx + 1, 27, 3, 6);

  // Pants shadow
  ctx.fillStyle = p.pantsDark;
  ctx.fillRect(cx - 1, 27, 2, 5);

  // Shoes
  ctx.fillStyle = p.shoes;
  ctx.fillRect(cx - 5, 33, 4, 2);
  ctx.fillRect(cx + 1, 33, 4, 2);

  // Blush
  ctx.fillStyle = p.blush + '60';
  ctx.beginPath();
  ctx.arc(cx - 3.5, 12, 1.5, 0, Math.PI * 2);
  ctx.arc(cx + 3.5, 12, 1.5, 0, Math.PI * 2);
  ctx.fill();
}

/* ── Face ─────────────────────────────────────────────────────────────── */

function drawFace(ctx: OffscreenCanvasRenderingContext2D, p: CharacterPalette, sway: number): void {
  const cx = W / 2 + sway;

  // Eye whites
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(cx - 2.5, 10, 1.5, 1.2, 0, 0, Math.PI * 2);
  ctx.ellipse(cx + 2.5, 10, 1.5, 1.2, 0, 0, Math.PI * 2);
  ctx.fill();

  // Pupils
  ctx.fillStyle = p.eye;
  ctx.beginPath();
  ctx.arc(cx - 2.2, 10.2, 0.8, 0, Math.PI * 2);
  ctx.arc(cx + 2.8, 10.2, 0.8, 0, Math.PI * 2);
  ctx.fill();

  // Eye highlight
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(cx - 2.8, 9.6, 0.4, 0, Math.PI * 2);
  ctx.arc(cx + 2.2, 9.6, 0.4, 0, Math.PI * 2);
  ctx.fill();

  // Nose (subtle line)
  ctx.strokeStyle = p.skinShadow;
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(cx, 11);
  ctx.lineTo(cx + 0.5, 12.5);
  ctx.stroke();

  // Mouth (small smile)
  ctx.strokeStyle = p.skinShadow;
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.arc(cx, 13.5, 1.5, 0.2, Math.PI - 0.2);
  ctx.stroke();
}

/* ── Hair shapes per platform ────────────────────────────────────────── */

const HAIR_MAP: Record<string, HairDef> = {
  telegram: {
    // Cap + short sides
    draw(ctx, p) {
      const cx = W / 2;
      // Cap visor
      ctx.fillStyle = p.accessory;
      ctx.beginPath();
      ctx.ellipse(cx, 5, 7, 3, 0, Math.PI, Math.PI * 2);
      ctx.fill();
      // Cap body
      ctx.beginPath();
      ctx.ellipse(cx, 5, 6, 4, 0, Math.PI, Math.PI * 2);
      ctx.fill();
      // Visor brim
      ctx.fillStyle = p.accessory;
      ctx.fillRect(cx - 7, 5, 14, 1.5);
      // Short hair on sides
      ctx.fillStyle = p.hair;
      ctx.fillRect(cx - 6, 7, 2, 5);
      ctx.fillRect(cx + 4, 7, 2, 5);
    },
  },
  slack: {
    // Neat side part, voluminous
    draw(ctx, p) {
      const cx = W / 2;
      ctx.fillStyle = p.hair;
      ctx.beginPath();
      ctx.ellipse(cx, 7, 6.5, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      // Part line
      ctx.strokeStyle = p.hairDark;
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(cx - 2, 2);
      ctx.lineTo(cx - 1, 7);
      ctx.stroke();
      // Highlight
      ctx.fillStyle = p.hairLight + '60';
      ctx.beginPath();
      ctx.ellipse(cx + 2, 5, 3, 2, -0.3, 0, Math.PI * 2);
      ctx.fill();
    },
  },
  discord: {
    // Spiky, messy
    draw(ctx, p) {
      const cx = W / 2;
      ctx.fillStyle = p.hair;
      // Base
      ctx.beginPath();
      ctx.ellipse(cx, 7, 6, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      // Spikes
      ctx.beginPath();
      ctx.moveTo(cx - 4, 3);
      ctx.lineTo(cx - 5, 0);
      ctx.lineTo(cx - 2, 2);
      ctx.lineTo(cx, -1);
      ctx.lineTo(cx + 2, 2);
      ctx.lineTo(cx + 5, 0);
      ctx.lineTo(cx + 4, 3);
      ctx.closePath();
      ctx.fill();
      // Highlight
      ctx.fillStyle = p.hairLight + '50';
      ctx.beginPath();
      ctx.moveTo(cx - 1, 1);
      ctx.lineTo(cx, -1);
      ctx.lineTo(cx + 1, 1);
      ctx.fill();
    },
  },
  whatsapp: {
    // Long wavy, past shoulders
    draw(ctx, p) {
      const cx = W / 2;
      ctx.fillStyle = p.hair;
      // Top dome
      ctx.beginPath();
      ctx.ellipse(cx, 7, 6.5, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      // Long sides
      ctx.fillRect(cx - 7, 8, 3, 12);
      ctx.fillRect(cx + 4, 8, 3, 12);
      // Wavy tips
      ctx.beginPath();
      ctx.arc(cx - 5.5, 20, 1.5, 0, Math.PI);
      ctx.arc(cx + 5.5, 20, 1.5, 0, Math.PI);
      ctx.fill();
      // Highlight
      ctx.fillStyle = p.hairLight + '40';
      ctx.beginPath();
      ctx.ellipse(cx - 1, 5, 3, 2, 0, 0, Math.PI * 2);
      ctx.fill();
    },
  },
  email: {
    // Neat, professional side-swept
    draw(ctx, p) {
      const cx = W / 2;
      ctx.fillStyle = p.hair;
      ctx.beginPath();
      ctx.ellipse(cx, 7, 6, 4.5, 0, 0, Math.PI * 2);
      ctx.fill();
      // Side sweep
      ctx.fillStyle = p.hairLight;
      ctx.beginPath();
      ctx.ellipse(cx + 2, 5, 4, 2.5, 0.3, 0, Math.PI);
      ctx.fill();
    },
  },
  owner: {
    // Slicked back, distinguished
    draw(ctx, p) {
      const cx = W / 2;
      ctx.fillStyle = p.hair;
      ctx.beginPath();
      ctx.ellipse(cx, 7, 6, 4.5, 0, 0, Math.PI * 2);
      ctx.fill();
      // Slick-back highlight streaks
      ctx.strokeStyle = p.hairLight;
      ctx.lineWidth = 0.8;
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(cx + i, 3);
        ctx.quadraticCurveTo(cx + i * 1.5, 5, cx + i * 2, 7);
        ctx.stroke();
      }
    },
  },
};

/* ── Clothing shapes per platform ────────────────────────────────────── */

const CLOTHING_MAP: Record<string, ClothingDef> = {
  telegram: {
    // Casual tee with logo stripe
    draw(ctx, p) {
      const cx = W / 2;
      // Collar
      ctx.fillStyle = p.shirtLight;
      ctx.fillRect(cx - 3, 16, 6, 2);
    },
  },
  slack: {
    // Sweater vest over shirt
    draw(ctx, p) {
      const cx = W / 2;
      // Vest overlay
      ctx.fillStyle = p.accessory + '40';
      ctx.fillRect(cx - 4, 18, 8, 8);
      // Collar visible
      ctx.fillStyle = p.shirtLight;
      ctx.fillRect(cx - 3, 16, 6, 2);
    },
  },
  discord: {
    // Hoodie with front pocket
    draw(ctx, p) {
      const cx = W / 2;
      // Hood outline behind head
      ctx.strokeStyle = p.shirtDark;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, 7, 7, 0.6, Math.PI - 0.6);
      ctx.stroke();
      // Pocket
      ctx.strokeStyle = p.shirtDark;
      ctx.lineWidth = 0.5;
      ctx.strokeRect(cx - 3, 23, 6, 3);
    },
  },
  whatsapp: {
    // Open cardigan
    draw(ctx, p) {
      const cx = W / 2;
      // Cardigan edges
      ctx.fillStyle = p.accessory;
      ctx.fillRect(cx - 6, 17, 2, 10);
      ctx.fillRect(cx + 4, 17, 2, 10);
    },
  },
  email: {
    // Button-up with buttons
    draw(ctx, p) {
      const cx = W / 2;
      // Button line
      ctx.fillStyle = p.shirtLight;
      ctx.fillRect(cx - 0.5, 17, 1, 10);
      // Buttons
      for (let y = 18; y < 27; y += 3) {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(cx, y, 0.4, 0, Math.PI * 2);
        ctx.fill();
      }
      // Collar points
      ctx.fillStyle = p.shirtLight;
      ctx.beginPath();
      ctx.moveTo(cx - 3, 16);
      ctx.lineTo(cx, 18);
      ctx.lineTo(cx + 3, 16);
      ctx.lineTo(cx + 2, 16);
      ctx.lineTo(cx, 17);
      ctx.lineTo(cx - 2, 16);
      ctx.closePath();
      ctx.fill();
    },
  },
  owner: {
    // Suit jacket + tie
    draw(ctx, p) {
      const cx = W / 2;
      // Jacket lapels
      ctx.fillStyle = p.shirtDark;
      ctx.beginPath();
      ctx.moveTo(cx - 5, 17);
      ctx.lineTo(cx - 2, 21);
      ctx.lineTo(cx - 5, 27);
      ctx.lineTo(cx - 6, 27);
      ctx.lineTo(cx - 6, 17);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx + 5, 17);
      ctx.lineTo(cx + 2, 21);
      ctx.lineTo(cx + 5, 27);
      ctx.lineTo(cx + 6, 27);
      ctx.lineTo(cx + 6, 17);
      ctx.closePath();
      ctx.fill();
      // Tie
      ctx.fillStyle = p.accessory;
      ctx.beginPath();
      ctx.moveTo(cx - 1, 17);
      ctx.lineTo(cx + 1, 17);
      ctx.lineTo(cx + 0.5, 26);
      ctx.lineTo(cx, 27);
      ctx.lineTo(cx - 0.5, 26);
      ctx.closePath();
      ctx.fill();
    },
  },
};

/* ── Accessories ─────────────────────────────────────────────────────── */

const ACCESSORY_DEFS: Record<string, AccessoryDef | undefined> = {
  slack: {
    // Round glasses
    draw(ctx, p) {
      const cx = W / 2;
      ctx.strokeStyle = p.accessory;
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.arc(cx - 2.5, 10, 2, 0, Math.PI * 2);
      ctx.arc(cx + 2.5, 10, 2, 0, Math.PI * 2);
      ctx.moveTo(cx - 0.5, 10);
      ctx.lineTo(cx + 0.5, 10);
      ctx.stroke();
    },
  },
  discord: {
    // Headphones
    draw(ctx, p) {
      const cx = W / 2;
      ctx.strokeStyle = p.accessory;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(cx, 6, 7, Math.PI + 0.3, -0.3);
      ctx.stroke();
      // Ear pads
      ctx.fillStyle = p.accessory;
      ctx.beginPath();
      ctx.ellipse(cx - 6.5, 8, 1.5, 2.5, 0, 0, Math.PI * 2);
      ctx.ellipse(cx + 6.5, 8, 1.5, 2.5, 0, 0, Math.PI * 2);
      ctx.fill();
    },
  },
};

/* ── Outline pass ────────────────────────────────────────────────────── */

function applyOutline(ctx: OffscreenCanvasRenderingContext2D, color: string): void {
  const imageData = ctx.getImageData(0, 0, W, H);
  const { data, width, height } = imageData;

  const outline = new Uint8ClampedArray(data.length);
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const alpha = data[i + 3];
      if (alpha > 0) continue; // only draw outline on transparent pixels

      // Check if any neighbor is opaque
      const hasOpaqueNeighbor =
        getAlpha(data, width, height, x - 1, y) > 128 ||
        getAlpha(data, width, height, x + 1, y) > 128 ||
        getAlpha(data, width, height, x, y - 1) > 128 ||
        getAlpha(data, width, height, x, y + 1) > 128;

      if (hasOpaqueNeighbor) {
        outline[i] = r;
        outline[i + 1] = g;
        outline[i + 2] = b;
        outline[i + 3] = 220;
      }
    }
  }

  // Merge outline into image
  for (let i = 0; i < data.length; i += 4) {
    if (outline[i + 3] > 0) {
      data[i] = outline[i];
      data[i + 1] = outline[i + 1];
      data[i + 2] = outline[i + 2];
      data[i + 3] = outline[i + 3];
    }
  }
  ctx.putImageData(imageData, 0, 0);
}

function getAlpha(data: Uint8ClampedArray, w: number, h: number, x: number, y: number): number {
  if (x < 0 || x >= w || y < 0 || y >= h) return 0;
  return data[(y * w + x) * 4 + 3];
}
