/**
 * Procedural furniture sprite generator.
 *
 * Generates furniture bitmaps via Canvas 2D shapes with wood grain,
 * gradients, and recognizable detail. Much higher quality than
 * hand-coded pixel arrays.
 */

const WOOD_DARK = '#5a3a1e';
const WOOD_MID = '#7a5230';
const WOOD_LIGHT = '#a67c52';
const WOOD_HIGHLIGHT = '#c49a6c';
const METAL = '#78909c';
const METAL_DARK = '#546e7a';
const SCREEN_BG = '#1e293b';
const SCREEN_GLOW = '#4fc3f7';

/* ── Desk (24x14) ────────────────────────────────────────────────────── */

export function generateDesk(): OffscreenCanvas {
  const c = new OffscreenCanvas(24, 14);
  const ctx = c.getContext('2d')!;

  // Table top
  const topGrad = ctx.createLinearGradient(0, 0, 0, 5);
  topGrad.addColorStop(0, WOOD_HIGHLIGHT);
  topGrad.addColorStop(0.5, WOOD_LIGHT);
  topGrad.addColorStop(1, WOOD_MID);
  ctx.fillStyle = topGrad;
  ctx.fillRect(1, 0, 22, 5);

  // Wood grain lines
  ctx.strokeStyle = WOOD_MID + '60';
  ctx.lineWidth = 0.3;
  for (let y = 1; y < 4; y += 1.2) {
    ctx.beginPath();
    ctx.moveTo(2, y);
    ctx.lineTo(22, y);
    ctx.stroke();
  }

  // Front edge
  ctx.fillStyle = WOOD_DARK;
  ctx.fillRect(1, 5, 22, 1);

  // Legs
  ctx.fillStyle = WOOD_DARK;
  ctx.fillRect(2, 6, 2, 7);
  ctx.fillRect(20, 6, 2, 7);

  // Bottom crossbar
  ctx.fillStyle = WOOD_MID;
  ctx.fillRect(2, 12, 20, 1);

  return c;
}

/* ── Monitor (14x12) ─────────────────────────────────────────────────── */

export function generateMonitor(): OffscreenCanvas {
  const c = new OffscreenCanvas(14, 12);
  const ctx = c.getContext('2d')!;

  // Bezel
  ctx.fillStyle = METAL_DARK;
  ctx.fillRect(0, 0, 14, 9);

  // Screen
  ctx.fillStyle = SCREEN_BG;
  ctx.fillRect(1, 1, 12, 7);

  // Code lines on screen
  const codeColors = ['#66bb6a', '#4fc3f7', '#ff7043', '#b388ff', '#ffcc02'];
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = codeColors[i % codeColors.length];
    const lineW = 3 + Math.floor(Math.random() * 6);
    ctx.fillRect(2, 2 + i * 1.5, lineW, 0.8);
  }

  // Screen glow reflection
  ctx.fillStyle = SCREEN_GLOW + '15';
  ctx.fillRect(1, 1, 12, 7);

  // Stand
  ctx.fillStyle = METAL;
  ctx.fillRect(6, 9, 2, 1);
  ctx.fillRect(4, 10, 6, 1);

  return c;
}

/* ── Chair (12x14) ───────────────────────────────────────────────────── */

export function generateChair(): OffscreenCanvas {
  const c = new OffscreenCanvas(12, 14);
  const ctx = c.getContext('2d')!;

  // Backrest
  const backGrad = ctx.createLinearGradient(3, 0, 9, 0);
  backGrad.addColorStop(0, '#4a4a4a');
  backGrad.addColorStop(0.5, '#5a5a5a');
  backGrad.addColorStop(1, '#4a4a4a');
  ctx.fillStyle = backGrad;
  ctx.beginPath();
  ctx.roundRect(3, 0, 6, 5, 1);
  ctx.fill();

  // Seat cushion
  const seatGrad = ctx.createLinearGradient(2, 5, 2, 9);
  seatGrad.addColorStop(0, '#5a5a5a');
  seatGrad.addColorStop(1, '#3a3a3a');
  ctx.fillStyle = seatGrad;
  ctx.beginPath();
  ctx.roundRect(2, 5, 8, 4, 1);
  ctx.fill();

  // Center post
  ctx.fillStyle = METAL_DARK;
  ctx.fillRect(5, 9, 2, 2);

  // Wheels
  ctx.fillStyle = '#333';
  ctx.beginPath();
  ctx.arc(3, 13, 1, 0, Math.PI * 2);
  ctx.arc(9, 13, 1, 0, Math.PI * 2);
  ctx.arc(6, 13, 1, 0, Math.PI * 2);
  ctx.fill();

  // Wheel legs
  ctx.strokeStyle = METAL_DARK;
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(6, 11);
  ctx.lineTo(3, 12);
  ctx.moveTo(6, 11);
  ctx.lineTo(9, 12);
  ctx.stroke();

  return c;
}

/* ── Coffee Machine (8x12) ───────────────────────────────────────────── */

export function generateCoffeeMachine(): OffscreenCanvas {
  const c = new OffscreenCanvas(8, 12);
  const ctx = c.getContext('2d')!;

  // Body
  ctx.fillStyle = '#37474f';
  ctx.beginPath();
  ctx.roundRect(1, 2, 6, 8, 1);
  ctx.fill();

  // Top
  ctx.fillStyle = '#455a64';
  ctx.fillRect(1, 0, 6, 3);

  // Display
  ctx.fillStyle = '#66bb6a';
  ctx.fillRect(2, 3, 4, 2);

  // Buttons
  ctx.fillStyle = '#ff7043';
  ctx.beginPath();
  ctx.arc(3, 7, 0.5, 0, Math.PI * 2);
  ctx.arc(5, 7, 0.5, 0, Math.PI * 2);
  ctx.fill();

  // Spout
  ctx.fillStyle = METAL;
  ctx.fillRect(3, 8, 2, 1);

  // Cup slot
  ctx.fillStyle = '#263238';
  ctx.fillRect(2, 9, 4, 2);

  return c;
}

/* ── Water Cooler (6x14) ─────────────────────────────────────────────── */

export function generateWaterCooler(): OffscreenCanvas {
  const c = new OffscreenCanvas(6, 14);
  const ctx = c.getContext('2d')!;

  // Water bottle (top)
  ctx.fillStyle = '#90caf9';
  ctx.beginPath();
  ctx.ellipse(3, 3, 2.5, 3, 0, 0, Math.PI * 2);
  ctx.fill();

  // Bottle highlight
  ctx.fillStyle = '#e3f2fd40';
  ctx.beginPath();
  ctx.ellipse(2, 2, 1, 2, -0.3, 0, Math.PI * 2);
  ctx.fill();

  // Body
  ctx.fillStyle = METAL;
  ctx.fillRect(1, 5, 4, 6);

  // Spigots
  ctx.fillStyle = '#4fc3f7';
  ctx.beginPath();
  ctx.arc(2, 7, 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ff7043';
  ctx.beginPath();
  ctx.arc(4, 7, 0.5, 0, Math.PI * 2);
  ctx.fill();

  // Drip tray
  ctx.fillStyle = METAL_DARK;
  ctx.fillRect(1, 9, 4, 1);

  // Legs
  ctx.fillStyle = METAL_DARK;
  ctx.fillRect(1, 11, 1, 3);
  ctx.fillRect(4, 11, 1, 3);

  return c;
}

/* ── Coffee Cup (5x5) ────────────────────────────────────────────────── */

export function generateCoffeeCup(): OffscreenCanvas {
  const c = new OffscreenCanvas(5, 5);
  const ctx = c.getContext('2d')!;

  // Steam wisps
  ctx.strokeStyle = '#bcaaa470';
  ctx.lineWidth = 0.3;
  ctx.beginPath();
  ctx.moveTo(2, 0);
  ctx.quadraticCurveTo(1.5, 0.5, 2, 1);
  ctx.moveTo(3, 0);
  ctx.quadraticCurveTo(3.5, 0.5, 3, 1);
  ctx.stroke();

  // Cup body
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.roundRect(1, 1.5, 3, 3, 0.5);
  ctx.fill();

  // Coffee inside
  ctx.fillStyle = '#5d4037';
  ctx.fillRect(1.5, 2, 2, 1);

  // Handle
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.arc(4.5, 3, 1, -1, 1);
  ctx.stroke();

  return c;
}
