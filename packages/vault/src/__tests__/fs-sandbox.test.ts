import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock @sauria/config ──────────────────────────────────────────
vi.mock('@sauria/config', () => ({
  paths: { home: '/tmp/sauria-test' },
}));

// ─── Mock node:fs/promises ────────────────────────────────────────
const mockReadFile = vi.fn().mockResolvedValue(Buffer.from('data'));
const mockWriteFile = vi.fn().mockResolvedValue(undefined);
const mockMkdir = vi.fn().mockResolvedValue(undefined);

vi.mock('node:fs/promises', () => ({
  readFile: (path: string) => mockReadFile(path),
  writeFile: (path: string, data: string | Buffer) => mockWriteFile(path, data),
  mkdir: (path: string, opts: Record<string, unknown>) => mockMkdir(path, opts),
}));

const { PathTraversalError, safePath, safeReadFile, safeWriteFile, safeMkdir } =
  await import('../fs-sandbox.js');

describe('fs-sandbox', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── PathTraversalError ─────────────────────────────────────

  describe('PathTraversalError', () => {
    it('has name "PathTraversalError"', () => {
      const err = new PathTraversalError('/evil/path');
      expect(err.name).toBe('PathTraversalError');
    });

    it('message includes the requested path', () => {
      const err = new PathTraversalError('/outside/path');
      expect(err.message).toContain('/outside/path');
    });

    it('is an instance of Error', () => {
      const err = new PathTraversalError('/x');
      expect(err).toBeInstanceOf(Error);
    });
  });

  // ─── safePath ───────────────────────────────────────────────

  describe('safePath', () => {
    it('allows path within home', () => {
      const result = safePath('/tmp/sauria-test/vault/secret.enc');
      expect(result).toBe('/tmp/sauria-test/vault/secret.enc');
    });

    it('allows path equal to home', () => {
      const result = safePath('/tmp/sauria-test');
      expect(result).toBe('/tmp/sauria-test');
    });

    it('throws PathTraversalError for ../ traversal', () => {
      expect(() => safePath('/tmp/sauria-test/vault/../../etc/passwd')).toThrow(PathTraversalError);
    });

    it('throws PathTraversalError for absolute path outside home', () => {
      expect(() => safePath('/etc/passwd')).toThrow(PathTraversalError);
    });

    it('throws for path that is a prefix but not a subdirectory', () => {
      // "/tmp/sauria-test-evil" starts with "/tmp/sauria-test" but is not inside it
      expect(() => safePath('/tmp/sauria-test-evil/file')).toThrow(PathTraversalError);
    });
  });

  // ─── safeReadFile ──────────────────────────────────────────

  describe('safeReadFile', () => {
    it('calls readFile with the resolved safe path', async () => {
      await safeReadFile('/tmp/sauria-test/vault/key.enc');
      expect(mockReadFile).toHaveBeenCalledWith('/tmp/sauria-test/vault/key.enc');
    });

    it('throws PathTraversalError for paths outside home', async () => {
      await expect(safeReadFile('/etc/shadow')).rejects.toThrow(PathTraversalError);
      expect(mockReadFile).not.toHaveBeenCalled();
    });
  });

  // ─── safeWriteFile ─────────────────────────────────────────

  describe('safeWriteFile', () => {
    it('creates parent directory then writes file', async () => {
      await safeWriteFile('/tmp/sauria-test/vault/key.enc', Buffer.from('data'));

      expect(mockMkdir).toHaveBeenCalledWith('/tmp/sauria-test/vault', { recursive: true });
      expect(mockWriteFile).toHaveBeenCalledWith(
        '/tmp/sauria-test/vault/key.enc',
        Buffer.from('data'),
      );
    });

    it('calls mkdir before writeFile', async () => {
      const callOrder: string[] = [];
      mockMkdir.mockImplementation(async () => {
        callOrder.push('mkdir');
        return undefined;
      });
      mockWriteFile.mockImplementation(async () => {
        callOrder.push('writeFile');
      });

      await safeWriteFile('/tmp/sauria-test/file.txt', 'content');
      expect(callOrder).toEqual(['mkdir', 'writeFile']);
    });

    it('throws PathTraversalError for paths outside home', async () => {
      await expect(safeWriteFile('/etc/evil', 'data')).rejects.toThrow(PathTraversalError);
      expect(mockMkdir).not.toHaveBeenCalled();
      expect(mockWriteFile).not.toHaveBeenCalled();
    });
  });

  // ─── safeMkdir ─────────────────────────────────────────────

  describe('safeMkdir', () => {
    it('calls mkdir with recursive option on safe path', async () => {
      await safeMkdir('/tmp/sauria-test/vault/subdir');
      expect(mockMkdir).toHaveBeenCalledWith('/tmp/sauria-test/vault/subdir', {
        recursive: true,
      });
    });

    it('throws PathTraversalError for paths outside home', async () => {
      await expect(safeMkdir('/usr/local/evil')).rejects.toThrow(PathTraversalError);
      expect(mockMkdir).not.toHaveBeenCalled();
    });
  });
});
