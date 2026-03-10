import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';

// ─── Mock @sauria/config ──────────────────────────────────────────
vi.mock('@sauria/config', () => ({
  paths: { home: '/tmp/sauria-test', vault: '/tmp/sauria-test/vault' },
}));

// ─── Mock node:fs/promises (chmod, unlink) ────────────────────────
const mockChmod = vi.fn().mockResolvedValue(undefined);
const mockUnlink = vi.fn().mockResolvedValue(undefined);

vi.mock('node:fs/promises', () => ({
  chmod: (path: string, mode: number) => mockChmod(path, mode),
  unlink: (path: string) => mockUnlink(path),
}));

// ─── Mock derive-password ─────────────────────────────────────────
vi.mock('../derive-password.js', () => ({
  deriveVaultPassword: () => 'test-vault-password',
}));

// ─── Mock fs-sandbox ──────────────────────────────────────────────
vi.mock('../fs-sandbox.js', () => ({
  safePath: (p: string) => p,
  safeReadFile: vi.fn(),
  safeWriteFile: vi.fn().mockResolvedValue(undefined),
}));

// Import after mocks
const { generateMasterKey, deriveWrappingKey, encryptData, decryptData } = await import(
  '../crypto.js'
);
const { storeSecret, getSecret, deleteSecret, vaultStore, vaultGet, vaultDelete } = await import(
  '../crypto.js'
);
const fsSandbox = await import('../fs-sandbox.js');

const mockSafeReadFile = fsSandbox.safeReadFile as Mock;
const mockSafeWriteFile = fsSandbox.safeWriteFile as Mock;

describe('crypto', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSafeWriteFile.mockResolvedValue(undefined);
  });

  // ─── generateMasterKey ────────────────────────────────────────

  describe('generateMasterKey', () => {
    it('returns a 32-byte Buffer', () => {
      const key = generateMasterKey();
      expect(Buffer.isBuffer(key)).toBe(true);
      expect(key.length).toBe(32);
    });

    it('returns a unique value each call', () => {
      const a = generateMasterKey();
      const b = generateMasterKey();
      expect(a.equals(b)).toBe(false);
    });
  });

  // ─── deriveWrappingKey ────────────────────────────────────────

  describe('deriveWrappingKey', () => {
    it('returns a 32-byte Buffer', () => {
      const salt = Buffer.alloc(32, 0);
      const key = deriveWrappingKey('password', salt);
      expect(Buffer.isBuffer(key)).toBe(true);
      expect(key.length).toBe(32);
    });

    it('is deterministic with same password and salt', () => {
      const salt = Buffer.alloc(32, 1);
      const a = deriveWrappingKey('password', salt);
      const b = deriveWrappingKey('password', salt);
      expect(a.equals(b)).toBe(true);
    });

    it('produces different key with different salt', () => {
      const saltA = Buffer.alloc(32, 1);
      const saltB = Buffer.alloc(32, 2);
      const a = deriveWrappingKey('password', saltA);
      const b = deriveWrappingKey('password', saltB);
      expect(a.equals(b)).toBe(false);
    });

    it('produces different key with different password', () => {
      const salt = Buffer.alloc(32, 1);
      const a = deriveWrappingKey('alpha', salt);
      const b = deriveWrappingKey('bravo', salt);
      expect(a.equals(b)).toBe(false);
    });
  });

  // ─── encryptData / decryptData ────────────────────────────────

  describe('encryptData / decryptData', () => {
    const key = deriveWrappingKey('test', Buffer.alloc(32, 0));

    it('round-trips: decrypt(encrypt(data)) equals original', () => {
      const plaintext = Buffer.from('hello world', 'utf-8');
      const { iv, authTag, encrypted } = encryptData(plaintext, key);
      const result = decryptData(encrypted, key, iv, authTag);
      expect(result.equals(plaintext)).toBe(true);
    });

    it('round-trips empty data', () => {
      const plaintext = Buffer.alloc(0);
      const { iv, authTag, encrypted } = encryptData(plaintext, key);
      const result = decryptData(encrypted, key, iv, authTag);
      expect(result.length).toBe(0);
    });

    it('uses different IV per encryption', () => {
      const plaintext = Buffer.from('same data', 'utf-8');
      const a = encryptData(plaintext, key);
      const b = encryptData(plaintext, key);
      expect(a.iv.equals(b.iv)).toBe(false);
    });

    it('fails to decrypt with wrong key', () => {
      const plaintext = Buffer.from('secret', 'utf-8');
      const { iv, authTag, encrypted } = encryptData(plaintext, key);
      const wrongKey = deriveWrappingKey('wrong', Buffer.alloc(32, 0));
      expect(() => decryptData(encrypted, wrongKey, iv, authTag)).toThrow();
    });

    it('fails to decrypt with tampered auth tag', () => {
      const plaintext = Buffer.from('secret', 'utf-8');
      const { iv, authTag, encrypted } = encryptData(plaintext, key);
      const tampered = Buffer.from(authTag);
      tampered[0] = (tampered[0] ?? 0) ^ 0xff;
      expect(() => decryptData(encrypted, key, iv, tampered)).toThrow();
    });
  });

  // ─── storeSecret / getSecret ──────────────────────────────────

  describe('storeSecret / getSecret', () => {
    it('round-trips via mocked file I/O', async () => {
      let captured: Buffer | undefined;
      mockSafeWriteFile.mockImplementation(async (_path: string, data: Buffer) => {
        captured = data;
      });

      await storeSecret('my-key', 'my-value', 'password');
      expect(captured).toBeDefined();

      mockSafeReadFile.mockResolvedValue(captured as Buffer);
      const result = await getSecret('my-key', 'password');
      expect(result).toBe('my-value');
    });

    it('file layout is salt(32) + iv(12) + authTag(16) + encrypted', async () => {
      let captured: Buffer | undefined;
      mockSafeWriteFile.mockImplementation(async (_path: string, data: Buffer) => {
        captured = data;
      });

      await storeSecret('test', 'hello', 'pwd');
      expect(captured).toBeDefined();
      // "hello" is 5 bytes, AES-GCM output matches input length
      expect((captured as Buffer).length).toBe(32 + 12 + 16 + 5);
    });

    it('fails with wrong password', async () => {
      let captured: Buffer | undefined;
      mockSafeWriteFile.mockImplementation(async (_path: string, data: Buffer) => {
        captured = data;
      });

      await storeSecret('key', 'value', 'correct');

      mockSafeReadFile.mockResolvedValue(captured as Buffer);
      await expect(getSecret('key', 'wrong')).rejects.toThrow();
    });

    it('calls chmod on non-win32 platforms', async () => {
      mockSafeWriteFile.mockResolvedValue(undefined);

      if (process.platform !== 'win32') {
        await storeSecret('key', 'val', 'pwd');
        expect(mockChmod).toHaveBeenCalledWith(
          expect.stringContaining('.enc'),
          0o600,
        );
      }
    });
  });

  // ─── deleteSecret ─────────────────────────────────────────────

  describe('deleteSecret', () => {
    it('overwrites with random bytes then unlinks', async () => {
      const original = Buffer.alloc(60, 0xab);
      mockSafeReadFile.mockResolvedValue(original);
      mockSafeWriteFile.mockResolvedValue(undefined);
      mockUnlink.mockResolvedValue(undefined);

      await deleteSecret('my-secret');

      expect(mockSafeReadFile).toHaveBeenCalled();
      expect(mockSafeWriteFile).toHaveBeenCalled();

      const writeCall = mockSafeWriteFile.mock.calls[0] as [string, Buffer] | undefined;
      if (!writeCall) throw new Error('Expected safeWriteFile to have been called');
      const writtenData = writeCall[1];
      expect(writtenData.length).toBe(original.length);
      expect(writtenData.equals(original)).toBe(false);

      expect(mockUnlink).toHaveBeenCalled();
    });

    it('calls safePath via the module for the file', async () => {
      mockSafeReadFile.mockResolvedValue(Buffer.alloc(10));
      mockSafeWriteFile.mockResolvedValue(undefined);
      mockUnlink.mockResolvedValue(undefined);

      await deleteSecret('test');

      // deleteSecret reads the file, overwrites, then unlinks
      expect(mockSafeReadFile).toHaveBeenCalledWith(
        expect.stringContaining('test.enc'),
      );
    });
  });

  // ─── High-level API ───────────────────────────────────────────

  describe('vaultStore / vaultGet / vaultDelete', () => {
    it('vaultStore stores via safeWriteFile', async () => {
      mockSafeWriteFile.mockResolvedValue(undefined);
      await vaultStore('token', 'abc123');
      expect(mockSafeWriteFile).toHaveBeenCalled();
    });

    it('vaultGet round-trips through vaultStore', async () => {
      let captured: Buffer | undefined;
      mockSafeWriteFile.mockImplementation(async (_path: string, data: Buffer) => {
        captured = data;
      });

      await vaultStore('token', 'secret-value');

      mockSafeReadFile.mockResolvedValue(captured as Buffer);
      const result = await vaultGet('token');
      expect(result).toBe('secret-value');
    });

    it('vaultGet returns null on decryption failure', async () => {
      mockSafeReadFile.mockRejectedValue(new Error('file not found'));
      const result = await vaultGet('nonexistent');
      expect(result).toBeNull();
    });

    it('vaultDelete suppresses errors for missing secrets', async () => {
      mockSafeReadFile.mockRejectedValue(new Error('not found'));
      await expect(vaultDelete('gone')).resolves.toBeUndefined();
    });
  });
});
