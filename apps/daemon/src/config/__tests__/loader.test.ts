import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs/promises', () => ({
  chmod: vi.fn(),
}));

vi.mock('../paths.js', () => ({
  paths: {
    config: '/mock-home/.sauria/config.json5',
    home: '/mock-home/.sauria',
    logs: '/mock-home/.sauria/logs',
    tmp: '/mock-home/.sauria/tmp',
    exports: '/mock-home/.sauria/exports',
    vault: '/mock-home/.sauria/vault',
  },
}));

vi.mock('../../security/fs-sandbox.js', () => ({
  safeReadFile: vi.fn(),
  safeWriteFile: vi.fn(),
  safeMkdir: vi.fn(),
}));

vi.mock('../schema.js', () => ({
  SauriaConfigSchema: {
    parse: vi.fn((v: unknown) => v),
  },
}));

vi.mock('../defaults.js', () => ({
  DEFAULT_CONFIG: {
    auth: {},
    models: { primary: 'default-model' },
  },
}));

vi.mock('json5', () => ({
  default: {
    parse: vi.fn((s: string) => JSON.parse(s)),
    stringify: vi.fn((v: unknown, opts?: { space?: number }) =>
      JSON.stringify(v, null, opts?.space),
    ),
  },
}));

import { chmod } from 'node:fs/promises';
import { safeReadFile, safeWriteFile, safeMkdir } from '../../security/fs-sandbox.js';
import { loadConfig, saveConfig, ensureConfigDir } from '../loader.js';

describe('loadConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns default config when file not found', async () => {
    const error = new Error('File not found') as NodeJS.ErrnoException;
    error.code = 'ENOENT';
    vi.mocked(safeReadFile).mockRejectedValue(error);

    const config = await loadConfig();

    expect(config).toEqual({
      auth: {},
      models: { primary: 'default-model' },
    });
  });

  it('throws non-ENOENT errors', async () => {
    const error = new Error('Permission denied') as NodeJS.ErrnoException;
    error.code = 'EACCES';
    vi.mocked(safeReadFile).mockRejectedValue(error);

    await expect(loadConfig()).rejects.toThrow('Permission denied');
  });

  it('parses config from file', async () => {
    const configData = {
      auth: { anthropic: { method: 'encrypted_file' } },
      models: { primary: 'claude-sonnet-4-20250514' },
    };
    vi.mocked(safeReadFile).mockResolvedValue(Buffer.from(JSON.stringify(configData)));

    const config = await loadConfig();

    expect(config).toEqual(configData);
  });
});

describe('saveConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes config and sets permissions', async () => {
    vi.mocked(safeWriteFile).mockResolvedValue(undefined);
    vi.mocked(chmod).mockResolvedValue(undefined);

    await saveConfig({ auth: {}, models: { primary: 'test' } } as never);

    expect(safeWriteFile).toHaveBeenCalledWith(
      '/mock-home/.sauria/config.json5',
      expect.any(String),
    );
    expect(chmod).toHaveBeenCalledWith('/mock-home/.sauria/config.json5', 0o600);
  });
});

describe('ensureConfigDir', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates all required directories', async () => {
    vi.mocked(safeMkdir).mockResolvedValue(undefined);

    await ensureConfigDir();

    expect(safeMkdir).toHaveBeenCalledWith('/mock-home/.sauria');
    expect(safeMkdir).toHaveBeenCalledWith('/mock-home/.sauria/logs');
    expect(safeMkdir).toHaveBeenCalledWith('/mock-home/.sauria/tmp');
    expect(safeMkdir).toHaveBeenCalledWith('/mock-home/.sauria/exports');
    expect(safeMkdir).toHaveBeenCalledWith('/mock-home/.sauria/vault');
  });
});
