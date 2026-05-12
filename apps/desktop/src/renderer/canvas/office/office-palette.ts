/**
 * Stardew Valley-grade color palettes for pixel art sprites.
 *
 * Rich multi-shade palettes: 3 shades per material (dark/mid/light),
 * warm outlines, blush cheeks, detailed eye colors.
 *
 * Palette index map (16 slots):
 *   0=transparent, 1=outline, 2=skin, 3=skinShadow, 4=blush,
 *   5=hair, 6=hairDark, 7=hairLight, 8=shirt, 9=shirtDark,
 *   10=shirtLight, 11=pants, 12=pantsDark, 13=shoes,
 *   14=accessory, 15=eyePupil
 *
 * Eye white is hardcoded as #ffffff at index 16 (extra slot).
 */

import type { CharacterPalette } from './office-types.js';

/* ── Furniture palette (warm wood, Stardew-style richness) ───────────── */

export const FURNITURE_PALETTE: readonly string[] = [
  '', // 0 = transparent
  '#5a3a1e', // 1 = wood dark (walnut shadow)
  '#7a5230', // 2 = wood mid (warm oak)
  '#a67c52', // 3 = wood light (honey)
  '#c49a6c', // 4 = wood highlight (blonde)
  '#4a2e14', // 5 = wood very dark (mahogany)
  '#4fc3f7', // 6 = screen glow
  '#1a2a3a', // 7 = screen frame
  '#0d1f2d', // 8 = screen bg
  '#66bb6a', // 9 = green accent (indicator, book spine)
  '#8d6e63', // 10 = metal/gray
  '#37474f', // 11 = dark metal/keyboard
  '#2e7d32', // 12 = plant dark
  '#43a047', // 13 = plant mid
  '#66bb6a', // 14 = plant light
  '#a1887f', // 15 = clay/pot
] as const;

export const FLOOR_PALETTE: readonly string[] = [
  '',
  '#5d4037', // dark wood
  '#6d4c41', // mid wood
  '#795548', // light wood
  '#4e342e', // groove
] as const;

export const WALL_PALETTE: readonly string[] = [
  '',
  '#8d6e63',
  '#a1887f',
  '#bcaaa4',
  '#d7ccc8',
  '#5d4037',
] as const;

export const BUILDING_PALETTE: readonly string[] = [
  '',
  '#5d4037',
  '#795548',
  '#8d6e63',
  '#bcaaa4',
  '#a1887f',
  '#78909c',
  '#4fc3f7',
  '#0288d1',
  '#d7ccc8',
  '#4e342e',
  '#66bb6a',
  '#43a047',
  '#ff8a65',
  '#ffcc02',
  '#ffffff',
] as const;

/* ── Character palettes — rich multi-shade per platform ──────────────── */

const SKIN = '#f5c8a0';
const SKIN_SHADOW = '#d4a574';
const BLUSH = '#f0a0a0';
const OUTLINE = '#2a1f14';
const EYE = '#2a1f14';

interface PlatformStyle {
  readonly hair: string;
  readonly hairDark: string;
  readonly hairLight: string;
  readonly shirt: string;
  readonly shirtDark: string;
  readonly shirtLight: string;
  readonly pants: string;
  readonly pantsDark: string;
  readonly shoes: string;
  readonly accessory: string;
}

const PLATFORM_STYLES: Readonly<Record<string, PlatformStyle>> = {
  telegram: {
    hair: '#4a3728',
    hairDark: '#3a2a1c',
    hairLight: '#6b5240',
    shirt: '#29b6f6',
    shirtDark: '#0288d1',
    shirtLight: '#4fc3f7',
    pants: '#1565c0',
    pantsDark: '#0d47a1',
    shoes: '#4e342e',
    accessory: '#29b6f6',
  },
  slack: {
    hair: '#d4a03c',
    hairDark: '#b8862e',
    hairLight: '#e8c060',
    shirt: '#e91e63',
    shirtDark: '#c2185b',
    shirtLight: '#f06292',
    pants: '#4a148c',
    pantsDark: '#38006b',
    shoes: '#3e2723',
    accessory: '#e91e63',
  },
  discord: {
    hair: '#5c3d99',
    hairDark: '#4a2d80',
    hairLight: '#7e57c2',
    shirt: '#7c4dff',
    shirtDark: '#651fff',
    shirtLight: '#b388ff',
    pants: '#311b92',
    pantsDark: '#1a0066',
    shoes: '#3e2723',
    accessory: '#7c4dff',
  },
  whatsapp: {
    hair: '#3e2723',
    hairDark: '#2c1a10',
    hairLight: '#5d4037',
    shirt: '#66bb6a',
    shirtDark: '#43a047',
    shirtLight: '#81c784',
    pants: '#2e7d32',
    pantsDark: '#1b5e20',
    shoes: '#4e342e',
    accessory: '#66bb6a',
  },
  email: {
    hair: '#bf360c',
    hairDark: '#8c2500',
    hairLight: '#e64a19',
    shirt: '#ff7043',
    shirtDark: '#e64a19',
    shirtLight: '#ff8a65',
    pants: '#455a64',
    pantsDark: '#37474f',
    shoes: '#3e2723',
    accessory: '#ff7043',
  },
  owner: {
    hair: '#4e342e',
    hairDark: '#3e2723',
    hairLight: '#6d4c41',
    shirt: '#37474f',
    shirtDark: '#263238',
    shirtLight: '#546e7a',
    pants: '#263238',
    pantsDark: '#1a1a1a',
    shoes: '#1a1a1a',
    accessory: '#ffb300',
  },
};

export function buildCharacterPalette(
  platform: string,
  workspaceColor: string | null,
): CharacterPalette {
  const style = PLATFORM_STYLES[platform] ?? PLATFORM_STYLES.owner;
  const shirt = workspaceColor ?? style.shirt;

  return {
    hair: style.hair,
    hairDark: style.hairDark,
    hairLight: style.hairLight,
    skin: SKIN,
    skinShadow: SKIN_SHADOW,
    shirt,
    shirtDark: workspaceColor ? darken(shirt, 0.2) : style.shirtDark,
    shirtLight: workspaceColor ? lighten(shirt, 0.2) : style.shirtLight,
    pants: style.pants,
    pantsDark: style.pantsDark,
    shoes: style.shoes,
    accessory: style.accessory,
    outline: OUTLINE,
    blush: BLUSH,
    eye: EYE,
  };
}

export function characterPaletteToArray(p: CharacterPalette): readonly string[] {
  return [
    '', // 0 = transparent
    p.outline, // 1
    p.skin, // 2
    p.skinShadow, // 3
    p.blush, // 4
    p.hair, // 5
    p.hairDark, // 6
    p.hairLight, // 7
    p.shirt, // 8
    p.shirtDark, // 9
    p.shirtLight, // 10
    p.pants, // 11
    p.pantsDark, // 12
    p.shoes, // 13
    p.accessory, // 14
    p.eye, // 15
    '#ffffff', // 16 = eye white
  ];
}

/* ── Helpers ──────────────────────────────────────────────────────────── */

function lighten(hex: string, amount: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 0xff) + (255 - ((n >> 16) & 0xff)) * amount));
  const g = Math.min(255, Math.round(((n >> 8) & 0xff) + (255 - ((n >> 8) & 0xff)) * amount));
  const b = Math.min(255, Math.round((n & 0xff) + (255 - (n & 0xff)) * amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

function darken(hex: string, amount: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, Math.round(((n >> 16) & 0xff) * (1 - amount)));
  const g = Math.max(0, Math.round(((n >> 8) & 0xff) * (1 - amount)));
  const b = Math.max(0, Math.round((n & 0xff) * (1 - amount)));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}
