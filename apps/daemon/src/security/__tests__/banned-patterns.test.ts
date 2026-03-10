import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs/promises', () => ({
  readdir: vi.fn(),
  readFile: vi.fn(),
}));

import { readdir, readFile } from 'node:fs/promises';

import {
  BANNED_PATTERNS,
  scanForBannedPatterns,
  assertNoBannedPatterns,
} from '../banned-patterns.js';

import type { BannedPatternViolation } from '../banned-patterns.js';

function makeDirEntry(name: string, isDir: boolean): {
  name: string;
  isDirectory: () => boolean;
  isFile: () => boolean;
} {
  return {
    name,
    isDirectory: () => isDir,
    isFile: () => !isDir,
  };
}

describe('BANNED_PATTERNS', () => {
  it('contains child_process', () => {
    expect(BANNED_PATTERNS).toContain('child_process');
  });

  it('contains eval(', () => {
    expect(BANNED_PATTERNS).toContain('eval(');
  });

  it('contains .exec(', () => {
    expect(BANNED_PATTERNS).toContain('.exec(');
  });

  it('contains net.createServer', () => {
    expect(BANNED_PATTERNS).toContain('net.createServer');
  });

  it('contains .listen(', () => {
    expect(BANNED_PATTERNS).toContain('.listen(');
  });
});

describe('scanForBannedPatterns', () => {
  beforeEach(() => {
    vi.mocked(readdir).mockReset();
    vi.mocked(readFile).mockReset();
  });

  it('detects violations in mock files', async () => {
    vi.mocked(readdir).mockResolvedValue([
      makeDirEntry('bad.ts', false),
    ] as never);

    vi.mocked(readFile).mockResolvedValue(
      'import { exec } from "child_process";\nconst x = eval("code");',
    );

    const violations = await scanForBannedPatterns('/src');
    expect(violations.length).toBeGreaterThanOrEqual(2);

    const patterns = violations.map((v: BannedPatternViolation) => v.pattern);
    expect(patterns).toContain('child_process');
    expect(patterns).toContain('eval(');
  });

  it('returns correct line numbers', async () => {
    vi.mocked(readdir).mockResolvedValue([
      makeDirEntry('file.ts', false),
    ] as never);

    vi.mocked(readFile).mockResolvedValue('line 1\neval("bad")\nline 3');

    const violations = await scanForBannedPatterns('/src');
    const evalViolation = violations.find(
      (v: BannedPatternViolation) => v.pattern === 'eval(',
    );
    expect(evalViolation).toBeDefined();
    expect(evalViolation!.line).toBe(2);
  });

  it('skips node_modules directories', async () => {
    vi.mocked(readdir).mockResolvedValue([
      makeDirEntry('node_modules', true),
      makeDirEntry('clean.ts', false),
    ] as never);

    vi.mocked(readFile).mockResolvedValue('const x = 1;');

    const violations = await scanForBannedPatterns('/src');
    expect(violations).toHaveLength(0);
    // readdir should NOT be called for node_modules
    expect(readdir).toHaveBeenCalledTimes(1);
  });

  it('returns empty array for clean files', async () => {
    vi.mocked(readdir).mockResolvedValue([
      makeDirEntry('clean.ts', false),
    ] as never);

    vi.mocked(readFile).mockResolvedValue('const greeting = "hello world";\nexport default greeting;');

    const violations = await scanForBannedPatterns('/src');
    expect(violations).toHaveLength(0);
  });
});

describe('assertNoBannedPatterns', () => {
  beforeEach(() => {
    vi.mocked(readdir).mockReset();
    vi.mocked(readFile).mockReset();
  });

  it('passes on clean code', async () => {
    vi.mocked(readdir).mockResolvedValue([
      makeDirEntry('ok.ts', false),
    ] as never);

    vi.mocked(readFile).mockResolvedValue('const x = 42;');

    await expect(assertNoBannedPatterns('/src')).resolves.toBeUndefined();
  });

  it('throws on violations with summary', async () => {
    vi.mocked(readdir).mockResolvedValue([
      makeDirEntry('evil.ts', false),
    ] as never);

    vi.mocked(readFile).mockResolvedValue('eval("bad code")');

    await expect(assertNoBannedPatterns('/src')).rejects.toThrow('Banned pattern violations found');
    await expect(assertNoBannedPatterns('/src')).rejects.toThrow('eval(');
  });
});
