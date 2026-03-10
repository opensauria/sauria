import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs/promises', () => ({
  chmod: vi.fn().mockResolvedValue(undefined),
  stat: vi.fn(),
}));
vi.mock('../../config/paths.js', () => ({
  paths: {
    home: '/mock/.sauria',
    config: '/mock/.sauria/config.json',
    db: '/mock/.sauria/sauria.db',
  },
}));
vi.mock('../rate-limiter.js', () => ({
  SECURITY_LIMITS: {
    database: {
      maxSizeHardLimitBytes: 1_000_000_000,
      maxSizeWarnBytes: 500_000_000,
    },
  },
}));

import { stat, chmod } from 'node:fs/promises';
import {
  enforceFilePermissions,
  runSecurityChecks,
  SecurityCheckError,
} from '../startup-checks.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SecurityCheckError', () => {
  it('sets name and message', () => {
    const err = new SecurityCheckError('test', 'detail');
    expect(err.name).toBe('SecurityCheckError');
    expect(err.message).toContain('[test]');
    expect(err.message).toContain('detail');
  });
});

describe('enforceFilePermissions', () => {
  it('skips on win32', async () => {
    const original = process.platform;
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    await enforceFilePermissions('/some/file', 0o600);
    expect(stat).not.toHaveBeenCalled();
    Object.defineProperty(process, 'platform', { value: original, configurable: true });
  });

  it('does nothing when mode matches', async () => {
    vi.mocked(stat).mockResolvedValue({ mode: 0o100600 } as never);
    await enforceFilePermissions('/some/file', 0o600);
    expect(chmod).not.toHaveBeenCalled();
  });

  it('fixes permissions when mode differs', async () => {
    vi.mocked(stat).mockResolvedValue({ mode: 0o100644 } as never);
    await enforceFilePermissions('/some/file', 0o600);
    expect(chmod).toHaveBeenCalledWith('/some/file', 0o600);
  });

  it('silently returns on ENOENT', async () => {
    const err = Object.assign(new Error('not found'), { code: 'ENOENT' });
    vi.mocked(stat).mockRejectedValue(err);
    await expect(enforceFilePermissions('/missing', 0o600)).resolves.toBeUndefined();
  });

  it('rethrows other errors', async () => {
    vi.mocked(stat).mockRejectedValue(new Error('disk error'));
    await expect(enforceFilePermissions('/some/file', 0o600)).rejects.toThrow('disk error');
  });
});

describe('runSecurityChecks', () => {
  beforeEach(() => {
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
    vi.stubGlobal('process', {
      ...process,
      platform: 'darwin',
      getuid: () => 501,
      version: 'v24.0.0',
      execArgv: [],
    });
  });

  it('passes all checks in normal conditions', async () => {
    vi.mocked(stat).mockResolvedValue({ mode: 0o100700, uid: 501, size: 1000 } as never);
    await expect(runSecurityChecks()).resolves.toBeUndefined();
  });

  it('throws when running as root', async () => {
    vi.stubGlobal('process', {
      ...process,
      platform: 'darwin',
      getuid: () => 0,
      version: 'v24.0.0',
      execArgv: [],
    });
    await expect(runSecurityChecks()).rejects.toThrow('root');
  });

  it('throws on old Node version', async () => {
    vi.stubGlobal('process', {
      ...process,
      platform: 'darwin',
      getuid: () => 501,
      version: 'v20.0.0',
      execArgv: [],
    });
    await expect(runSecurityChecks()).rejects.toThrow('Node.js >= 22');
  });

  it('throws when debugger detected', async () => {
    vi.stubGlobal('process', {
      ...process,
      platform: 'darwin',
      getuid: () => 501,
      version: 'v24.0.0',
      execArgv: ['--inspect'],
    });
    await expect(runSecurityChecks()).rejects.toThrow('Debugger');
  });

  it('throws when home is owned by different uid', async () => {
    vi.mocked(stat).mockImplementation(async (path) => {
      if (path === '/mock/.sauria') {
        return { mode: 0o100700, uid: 999, size: 0 } as never;
      }
      return { mode: 0o100600, uid: 501, size: 0 } as never;
    });
    await expect(runSecurityChecks()).rejects.toThrow('ownership');
  });

  it('throws when database exceeds hard limit', async () => {
    vi.mocked(stat).mockImplementation(async (path) => {
      if (String(path).endsWith('.db')) {
        return { mode: 0o100600, uid: 501, size: 2_000_000_000 } as never;
      }
      return { mode: 0o100700, uid: 501, size: 0 } as never;
    });
    await expect(runSecurityChecks()).rejects.toThrow('db_size');
  });

  it('warns when database exceeds warning threshold', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.mocked(stat).mockImplementation(async (path) => {
      if (String(path).endsWith('.db')) {
        return { mode: 0o100600, uid: 501, size: 600_000_000 } as never;
      }
      return { mode: 0o100700, uid: 501, size: 0 } as never;
    });
    await runSecurityChecks();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Warning'));
    warnSpy.mockRestore();
  });

  it('handles ENOENT for home directory on first run', async () => {
    vi.mocked(stat).mockImplementation(async (path) => {
      if (path === '/mock/.sauria') {
        throw Object.assign(new Error('not found'), { code: 'ENOENT' });
      }
      return { mode: 0o100600, uid: 501, size: 0 } as never;
    });
    await expect(runSecurityChecks()).resolves.toBeUndefined();
  });
});
