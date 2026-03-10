import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock @sauria/config ──────────────────────────────────────────
vi.mock('@sauria/config', () => ({
  paths: { vault: '/tmp/sauria-test/vault' },
}));

// ─── Mock node:child_process ──────────────────────────────────────
const mockExecSync = vi.fn();

vi.mock('node:child_process', () => ({
  execSync: (cmd: string, opts: Record<string, unknown>) => mockExecSync(cmd, opts),
}));

// ─── Mock node:fs ─────────────────────────────────────────────────
const mockExistsSync = vi.fn().mockReturnValue(false);
const mockReadFileSync = vi.fn().mockReturnValue('');
const mockWriteFileSync = vi.fn();
const mockMkdirSync = vi.fn();

vi.mock('node:fs', () => ({
  existsSync: (path: string) => mockExistsSync(path),
  readFileSync: (path: string, enc: string) => mockReadFileSync(path, enc),
  writeFileSync: (path: string, data: string, enc: string) => mockWriteFileSync(path, data, enc),
  mkdirSync: (path: string, opts: Record<string, unknown>) => mockMkdirSync(path, opts),
}));

// ─── Mock node:os ─────────────────────────────────────────────────
const mockUserInfo = vi.fn(() => ({ username: 'fallback-user' }));

vi.mock('node:os', () => ({
  userInfo: () => mockUserInfo(),
}));

describe('machineId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockExistsSync.mockReturnValue(false);
    mockReadFileSync.mockReturnValue('');
    mockUserInfo.mockReturnValue({ username: 'fallback-user' });
  });

  async function importFresh() {
    const mod = await import('../machine-id.js');
    return mod.machineId;
  }

  it('returns cached value when cache file exists with content', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('CACHED-UUID-1234\n');

    const machineId = await importFresh();
    const result = machineId();

    expect(result).toBe('CACHED-UUID-1234');
    expect(mockExecSync).not.toHaveBeenCalled();
  });

  it('treats empty cache file as cache miss', async () => {
    // First call: existsSync for cache file -> true but empty
    // Second call: existsSync for cache dir -> false (needs mkdir)
    mockExistsSync
      .mockReturnValueOnce(true) // cache file exists
      .mockReturnValueOnce(false); // cache dir for writing
    mockReadFileSync.mockReturnValue('   \n');

    if (process.platform === 'darwin') {
      const uuid = 'ABC12345-6789-0DEF-ABCD-EF0123456789';
      mockExecSync.mockReturnValue(`  "IOPlatformUUID" = "${uuid}"\n`);
    }

    const machineId = await importFresh();
    const result = machineId();

    // Should not return empty - should have computed a value
    expect(result.trim().length).toBeGreaterThan(0);
  });

  it('parses IOPlatformUUID on macOS', async () => {
    if (process.platform !== 'darwin') return;

    mockExistsSync.mockReturnValue(false);
    const uuid = 'ABCD1234-5678-90EF-ABCD-EF0123456789';
    mockExecSync.mockReturnValue(`  "IOPlatformUUID" = "${uuid}"\n`);

    const machineId = await importFresh();
    const result = machineId();

    expect(result).toBe(uuid);
  });

  it('writes result to cache file after computation', async () => {
    mockExistsSync.mockReturnValue(false);

    if (process.platform === 'darwin') {
      const uuid = 'A0B1C2D3-E4F5-6789-ABCD-EF0123456789';
      mockExecSync.mockReturnValue(`  "IOPlatformUUID" = "${uuid}"\n`);
    }

    const machineId = await importFresh();
    machineId();

    expect(mockWriteFileSync).toHaveBeenCalledWith(
      '/tmp/sauria-test/vault/.machine-id',
      expect.any(String),
      'utf-8',
    );
  });

  it('creates cache directory if it does not exist', async () => {
    mockExistsSync.mockReturnValue(false);

    if (process.platform === 'darwin') {
      mockExecSync.mockReturnValue(`  "IOPlatformUUID" = "11111111-2222-3333-4444-555555555555"\n`);
    }

    const machineId = await importFresh();
    machineId();

    expect(mockMkdirSync).toHaveBeenCalledWith('/tmp/sauria-test/vault', { recursive: true });
  });

  it('does not create directory if it already exists', async () => {
    // First call for cache path: file doesn't exist
    // Second call for cache dir: exists
    mockExistsSync
      .mockReturnValueOnce(false) // cache file
      .mockReturnValueOnce(true); // cache dir

    if (process.platform === 'darwin') {
      mockExecSync.mockReturnValue(`  "IOPlatformUUID" = "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE"\n`);
    }

    const machineId = await importFresh();
    machineId();

    expect(mockMkdirSync).not.toHaveBeenCalled();
  });

  it('falls back to username when execSync throws', async () => {
    mockExistsSync.mockReturnValue(false);
    mockExecSync.mockImplementation(() => {
      throw new Error('command not found');
    });
    mockUserInfo.mockReturnValue({ username: 'alice' });

    const machineId = await importFresh();
    const result = machineId();

    expect(result).toBe('alice');
  });

  it('falls back to username when UUID regex does not match', async () => {
    if (process.platform !== 'darwin') return;

    mockExistsSync.mockReturnValue(false);
    mockExecSync.mockReturnValue('no uuid here\n');
    mockUserInfo.mockReturnValue({ username: 'bob' });

    const machineId = await importFresh();
    const result = machineId();

    expect(result).toBe('bob');
  });

  it('returns a non-empty string', async () => {
    mockExistsSync.mockReturnValue(false);
    if (process.platform === 'darwin') {
      mockExecSync.mockReturnValue(`  "IOPlatformUUID" = "12345678-ABCD-EF01-2345-6789ABCDEF01"\n`);
    } else {
      mockExecSync.mockImplementation(() => {
        throw new Error('not darwin');
      });
    }
    mockUserInfo.mockReturnValue({ username: 'someone' });

    const machineId = await importFresh();
    const result = machineId();

    expect(result.length).toBeGreaterThan(0);
  });

  it('reads /etc/machine-id on Linux', async () => {
    if (process.platform !== 'linux') return;

    mockExistsSync.mockReturnValue(false);
    mockReadFileSync.mockImplementation((path: string) => {
      if (path === '/etc/machine-id') return 'linux-machine-id-value\n';
      return '';
    });

    const machineId = await importFresh();
    const result = machineId();

    expect(result).toBe('linux-machine-id-value');
  });
});
