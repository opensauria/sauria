import { describe, it, expect } from 'vitest';

describe('version', () => {
  it('getVersion returns the SAURIA_VERSION global', async () => {
    // SAURIA_VERSION is injected by tsdown/vite define. Provide it for the test.
    // @ts-expect-error -- global injected at build time
    globalThis.SAURIA_VERSION = '2026.309.0';
    const { getVersion } = await import('../version.js');
    expect(getVersion()).toBe('2026.309.0');
  });

  it('returns a string value', async () => {
    // @ts-expect-error -- global injected at build time
    globalThis.SAURIA_VERSION = '1.0.0';
    // Re-import to pick up the new global — since getVersion reads at call time
    const { getVersion } = await import('../version.js');
    expect(typeof getVersion()).toBe('string');
  });

  it('version string is non-empty', async () => {
    // @ts-expect-error -- global injected at build time
    globalThis.SAURIA_VERSION = '0.1.0';
    const { getVersion } = await import('../version.js');
    expect(getVersion().length).toBeGreaterThan(0);
  });

  it('reflects the current SAURIA_VERSION value', async () => {
    // @ts-expect-error -- global injected at build time
    globalThis.SAURIA_VERSION = '2026.310.1';
    const { getVersion } = await import('../version.js');
    expect(getVersion()).toBe('2026.310.1');
  });
});
