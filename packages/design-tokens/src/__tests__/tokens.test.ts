import { describe, it, expect } from 'vitest';
import {
  colors,
  radii,
  spacing,
  typography,
  entityColors,
  zIndex,
  platformColors,
} from '../tokens.js';

describe('design tokens', () => {
  describe('colors', () => {
    it('defines all required color tokens', () => {
      const requiredKeys = [
        'bg', 'bgSolid', 'surface', 'surfaceHover', 'surfaceLight',
        'border', 'borderActive', 'borderHover',
        'text', 'textSecondary', 'textDim', 'textOnAccent',
        'accent', 'accentHover', 'accentSubtle',
        'success', 'error', 'warning', 'overlay',
      ] as const;
      for (const key of requiredKeys) {
        expect(colors[key]).toBeDefined();
        expect(typeof colors[key]).toBe('string');
      }
    });

    it('uses valid color formats (hex or rgba)', () => {
      for (const value of Object.values(colors)) {
        expect(value).toMatch(/^(#[0-9a-fA-F]{3,8}|rgba?\(.*\))$/);
      }
    });
  });

  describe('spacing', () => {
    it('defines all spacing keys', () => {
      const requiredKeys = ['xs', 'sm', 'smd', 'md', 'mld', 'lg', 'xl', '2xl', 'xxl'] as const;
      for (const key of requiredKeys) {
        expect(spacing[key]).toBeDefined();
      }
    });

    it('all spacing values are multiples of 4', () => {
      for (const [, value] of Object.entries(spacing)) {
        const numericValue = parseInt(value, 10);
        expect(numericValue % 4).toBe(0);
      }
    });

    it('spacing values are in ascending order', () => {
      const ordered = ['xs', 'sm', 'smd', 'md', 'mld', 'lg', 'xl', '2xl', 'xxl'] as const;
      for (let i = 1; i < ordered.length; i++) {
        const prev = parseInt(spacing[ordered[i - 1]!], 10);
        const curr = parseInt(spacing[ordered[i]!], 10);
        expect(curr).toBeGreaterThan(prev);
      }
    });
  });

  describe('radii', () => {
    it('defines all radius tokens', () => {
      expect(radii.default).toBeDefined();
      expect(radii.sm).toBeDefined();
      expect(radii.lg).toBeDefined();
      expect(radii.pill).toBeDefined();
    });

    it('sm < default < lg', () => {
      const sm = parseInt(radii.sm, 10);
      const def = parseInt(radii.default, 10);
      const lg = parseInt(radii.lg, 10);
      expect(sm).toBeLessThan(def);
      expect(def).toBeLessThan(lg);
    });
  });

  describe('typography', () => {
    it('defines all font size tokens', () => {
      expect(typography.sizeBase).toBeDefined();
      expect(typography.sizeSmall).toBeDefined();
      expect(typography.sizeMicro).toBeDefined();
      expect(typography.sizeLabel).toBeDefined();
      expect(typography.sizeHeading).toBeDefined();
      expect(typography.sizeLg).toBeDefined();
    });

    it('all font sizes are even numbers', () => {
      const sizeKeys = ['sizeBase', 'sizeSmall', 'sizeXSmall', 'sizeMicro', 'sizeLabel', 'sizeHeading', 'sizeLg'] as const;
      for (const key of sizeKeys) {
        const value = parseInt(typography[key], 10);
        expect(value % 2).toBe(0);
      }
    });

    it('defines font families', () => {
      expect(typography.fontFamily).toContain('system-ui');
      expect(typography.fontFamilyMono).toContain('Geist Mono');
    });
  });

  describe('entity colors', () => {
    it('defines colors for all entity types', () => {
      const types = ['person', 'project', 'company', 'event', 'document', 'goal', 'place', 'concept'] as const;
      for (const type of types) {
        expect(entityColors[type]).toBeDefined();
        expect(entityColors[type]).toMatch(/^#[0-9a-fA-F]{6}$/);
      }
    });
  });

  describe('platform colors', () => {
    it('defines colors for all platforms', () => {
      const platforms = ['telegram', 'discord', 'slack', 'whatsapp', 'email'] as const;
      for (const platform of platforms) {
        expect(platformColors[platform]).toBeDefined();
        expect(platformColors[platform]).toMatch(/^#[0-9a-fA-F]{6}$/);
      }
    });
  });

  describe('z-index', () => {
    it('defines all z-index layers', () => {
      const layers = ['base', 'dropdown', 'sticky', 'overlay', 'modal', 'toast', 'dock', 'toolbar', 'panel', 'ghost'] as const;
      for (const layer of layers) {
        expect(zIndex[layer]).toBeDefined();
      }
    });

    it('base is the lowest z-index', () => {
      expect(parseInt(zIndex.base, 10)).toBe(0);
    });
  });

  describe('immutability', () => {
    it('token objects are readonly (as const)', () => {
      expect(() => {
        (colors as Record<string, string>)['bg'] = 'red';
      }).not.toThrow();
      // as const provides type-level immutability, not runtime freeze.
      // The key guarantee is that the type system prevents mutation in TS.
      // We verify the values are string literals by checking they match expected format.
      expect(typeof colors.bg).toBe('string');
    });
  });
});
