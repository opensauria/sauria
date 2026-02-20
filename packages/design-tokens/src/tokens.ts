/**
 * Design tokens — single source of truth.
 *
 * All colors, radii, spacing, and typography values are defined here.
 * The generate script produces CSS custom properties and JSON from these values.
 */

export const colors = {
  bg: '#1a1a1a',
  bgSolid: '#1a1a1a',
  surface: 'rgba(255, 255, 255, 0.04)',
  surfaceHover: 'rgba(255, 255, 255, 0.07)',
  border: 'rgba(255, 255, 255, 0.08)',
  borderActive: 'rgba(255, 255, 255, 0.15)',
  text: '#ececec',
  textSecondary: '#999',
  textDim: '#555',
  accent: '#038b9a',
  accentHover: '#027a87',
  success: '#34d399',
  error: '#f87171',
} as const;

export const radii = {
  default: '12px',
  sm: '8px',
  pill: '9999px',
} as const;

export const spacing = {
  xs: '4px',
  sm: '8px',
  md: '16px',
  lg: '24px',
  xl: '32px',
  xxl: '48px',
} as const;

export const typography = {
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
  fontFamilyMono: "'Geist Mono', monospace",
  sizeBase: '14px',
  sizeSmall: '12px',
  sizeXSmall: '11px',
  sizeLabel: '13px',
} as const;

export const transitions = {
  fast: '0.15s ease',
  normal: '0.2s ease',
} as const;

export type Colors = typeof colors;
export type Radii = typeof radii;
export type Spacing = typeof spacing;
export type Typography = typeof typography;
export type Transitions = typeof transitions;
