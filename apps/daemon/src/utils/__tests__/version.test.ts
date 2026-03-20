import { describe, it, expect } from 'vitest';

describe('version', () => {
  it('getVersion returns the SAURIA_VERSION global', async () => {
    // @ts-expect-error -- global injected at build time
    globalThis.SAURIA_VERSION = '2026.309.0';
    const { getVersion } = await import('../version.js');
    expect(getVersion()).toBe('2026.309.0');
  });

  it('returns a string value', async () => {
    // @ts-expect-error -- global injected at build time
    globalThis.SAURIA_VERSION = '1.0.0';
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

describe('buildHash', () => {
  it('getBuildHash returns the SAURIA_BUILD_HASH global', async () => {
    // @ts-expect-error -- global injected at build time
    globalThis.SAURIA_BUILD_HASH = 'abc123def456';
    const { getBuildHash } = await import('../version.js');
    expect(getBuildHash()).toBe('abc123def456');
  });

  it('returns a string value', async () => {
    // @ts-expect-error -- global injected at build time
    globalThis.SAURIA_BUILD_HASH = 'deadbeef';
    const { getBuildHash } = await import('../version.js');
    expect(typeof getBuildHash()).toBe('string');
  });
});
