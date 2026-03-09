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
  surfaceLight: 'rgba(255, 255, 255, 0.06)',
  border: 'rgba(255, 255, 255, 0.08)',
  borderActive: 'rgba(255, 255, 255, 0.15)',
  borderHover: 'rgba(255, 255, 255, 0.2)',
  text: '#ececec',
  textSecondary: '#999',
  textDim: '#555',
  textOnAccent: '#ffffff',
  accent: '#038b9a',
  accentHover: '#027a87',
  accentSubtle: 'rgba(3, 139, 154, 0.15)',
  success: '#34d399',
  error: '#f87171',
  warning: '#f59e0b',
  overlay: 'rgba(0, 0, 0, 0.5)',
} as const;

export const radii = {
  default: '12px',
  sm: '8px',
  lg: '16px',
  pill: '9999px',
} as const;

export const spacing = {
  xs: '4px',
  sm: '8px',
  smd: '12px',
  md: '16px',
  mld: '20px',
  lg: '24px',
  xl: '32px',
  '2xl': '40px',
  xxl: '48px',
} as const;

export const opacity = {
  disabled: '0.4',
  muted: '0.6',
  subtle: '0.8',
} as const;

export const typography = {
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
  fontFamilyMono: "'Geist Mono', monospace",
  sizeBase: '14px',
  sizeSmall: '12px',
  sizeXSmall: '12px',
  sizeLabel: '14px',
  sizeMicro: '10px',
  sizeHeading: '16px',
  sizeLg: '18px',
} as const;

export const transitions = {
  fast: '0.15s ease',
  normal: '0.2s ease',
} as const;

export const entityColors = {
  person: '#3b82f6',
  project: '#34d399',
  company: '#a78bfa',
  event: '#f59e0b',
  document: '#6b7280',
  goal: '#038b9a',
  place: '#eab308',
  concept: '#ec4899',
} as const;

export const shadows = {
  sm: '0 1px 2px rgba(0, 0, 0, 0.3)',
  md: '0 4px 12px rgba(0, 0, 0, 0.4)',
  lg: '0 8px 24px rgba(0, 0, 0, 0.5)',
  glow: '0 0 20px rgba(3, 139, 154, 0.3)',
} as const;

export const zIndex = {
  base: '0',
  dropdown: '10',
  sticky: '20',
  overlay: '30',
  modal: '300',
  toast: '350',
  dock: '150',
  toolbar: '200',
  panel: '250',
  ghost: '1000',
} as const;

export const observationColors = {
  trait: '#a78bfa',
  preference: '#f59e0b',
  behavior: '#3b82f6',
  skill: '#34d399',
  fact: '#ec4899',
  goal: '#038b9a',
  relationship: '#6b7280',
} as const;

export const platformColors = {
  telegram: '#26A5E4',
  discord: '#5865F2',
  slack: '#E01E5A',
  whatsapp: '#25D366',
  email: '#EA4335',
} as const;

export type Colors = typeof colors;
export type Radii = typeof radii;
export type Spacing = typeof spacing;
export type Opacity = typeof opacity;
export type Typography = typeof typography;
export type Transitions = typeof transitions;
export type EntityColors = typeof entityColors;
export type Shadows = typeof shadows;
export type ZIndex = typeof zIndex;
export type ObservationColors = typeof observationColors;
export type PlatformColors = typeof platformColors;
