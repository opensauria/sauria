import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../security/vault-key.js', () => ({
  vaultGet: vi.fn(),
}));

vi.mock('../oauth.js', () => ({
  getValidOAuthToken: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

vi.mock('node:os', () => ({
  userInfo: vi.fn().mockReturnValue({ username: 'testuser' }),
}));

import { execSync } from 'node:child_process';
import { resolveCredential, resolveApiKey, isOAuthToken } from '../resolve.js';
import { vaultGet } from '../../security/vault-key.js';
import { getValidOAuthToken } from '../oauth.js';

const mockVaultGet = vi.mocked(vaultGet);
const mockGetValidOAuthToken = vi.mocked(getValidOAuthToken);
const mockExecSync = vi.mocked(execSync);

const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  vi.clearAllMocks();
  savedEnv['ANTHROPIC_API_KEY'] = process.env['ANTHROPIC_API_KEY'];
  savedEnv['OPENAI_API_KEY'] = process.env['OPENAI_API_KEY'];
  delete process.env['ANTHROPIC_API_KEY'];
  delete process.env['OPENAI_API_KEY'];
});

afterEach(() => {
  if (savedEnv['ANTHROPIC_API_KEY'] !== undefined) {
    process.env['ANTHROPIC_API_KEY'] = savedEnv['ANTHROPIC_API_KEY'];
  } else {
    delete process.env['ANTHROPIC_API_KEY'];
  }
  if (savedEnv['OPENAI_API_KEY'] !== undefined) {
    process.env['OPENAI_API_KEY'] = savedEnv['OPENAI_API_KEY'];
  } else {
    delete process.env['OPENAI_API_KEY'];
  }
});

describe('isOAuthToken', () => {
  it('returns true for tokens starting with sk-ant-oat01-', () => {
    expect(isOAuthToken('sk-ant-oat01-abcdef')).toBe(true);
  });

  it('returns false for regular API keys', () => {
    expect(isOAuthToken('sk-ant-api03-abcdef')).toBe(false);
    expect(isOAuthToken('some-random-key')).toBe(false);
  });
});

describe('resolveCredential', () => {
  it('returns oauth credential when vault has oauth data', async () => {
    const oauthData = {
      kind: 'oauth',
      accessToken: 'at',
      refreshToken: 'rt',
      expiresAt: Date.now() + 3600000,
    };
    mockVaultGet.mockImplementation(async (key: string) => {
      if (key === 'anthropic-oauth') return JSON.stringify(oauthData);
      return null;
    });

    const result = await resolveCredential('anthropic');
    expect(result).not.toBeNull();
    expect(result?.kind).toBe('oauth');
    if (result?.kind === 'oauth') {
      expect(result.accessToken).toBe('at');
    }
  });

  it('returns api_key credential when vault has api key but no oauth', async () => {
    mockVaultGet.mockImplementation(async (key: string) => {
      if (key === 'openai-api-key') return 'sk-openai-vault-key';
      return null;
    });

    const result = await resolveCredential('openai');
    expect(result).not.toBeNull();
    expect(result?.kind).toBe('api_key');
    if (result?.kind === 'api_key') {
      expect(result.value).toBe('sk-openai-vault-key');
    }
  });

  it('falls back to env var when vault has nothing', async () => {
    mockVaultGet.mockResolvedValue(null);
    process.env['ANTHROPIC_API_KEY'] = 'sk-env-key';

    const result = await resolveCredential('anthropic');
    expect(result).not.toBeNull();
    expect(result?.kind).toBe('api_key');
    if (result?.kind === 'api_key') {
      expect(result.value).toBe('sk-env-key');
    }
  });

  it('returns null when no credentials available', async () => {
    mockVaultGet.mockResolvedValue(null);

    const result = await resolveCredential('openai');
    expect(result).toBeNull();
  });

  it('follows priority: oauth > vault api key > env var', async () => {
    const oauthData = {
      kind: 'oauth',
      accessToken: 'oauth-token',
      refreshToken: 'rt',
      expiresAt: Date.now() + 3600000,
    };
    mockVaultGet.mockImplementation(async (key: string) => {
      if (key === 'anthropic-oauth') return JSON.stringify(oauthData);
      if (key === 'anthropic-api-key') return 'vault-api-key';
      return null;
    });
    process.env['ANTHROPIC_API_KEY'] = 'env-api-key';

    const result = await resolveCredential('anthropic');
    expect(result?.kind).toBe('oauth');
  });

  it('skips malformed oauth data and falls through', async () => {
    mockVaultGet.mockImplementation(async (key: string) => {
      if (key === 'anthropic-oauth') return JSON.stringify({ bad: 'data' });
      if (key === 'anthropic-api-key') return 'vault-key';
      return null;
    });

    const result = await resolveCredential('anthropic');
    expect(result?.kind).toBe('api_key');
  });
});

describe('resolveCredential — edge cases', () => {
  it('returns null when oauth data has wrong accessToken type', async () => {
    mockVaultGet.mockImplementation(async (key: string) => {
      if (key === 'openai-oauth')
        return JSON.stringify({ accessToken: 123, refreshToken: 'rt', expiresAt: 99999 });
      return null;
    });

    const result = await resolveCredential('openai');
    expect(result).toBeNull();
  });

  it('returns null when oauth data has wrong refreshToken type', async () => {
    mockVaultGet.mockImplementation(async (key: string) => {
      if (key === 'openai-oauth')
        return JSON.stringify({ accessToken: 'at', refreshToken: 123, expiresAt: 99999 });
      return null;
    });

    const result = await resolveCredential('openai');
    expect(result).toBeNull();
  });

  it('returns null when oauth data has wrong expiresAt type', async () => {
    mockVaultGet.mockImplementation(async (key: string) => {
      if (key === 'openai-oauth')
        return JSON.stringify({ accessToken: 'at', refreshToken: 'rt', expiresAt: 'not-a-number' });
      return null;
    });

    const result = await resolveCredential('openai');
    expect(result).toBeNull();
  });

  it('returns null when oauth data is an array', async () => {
    mockVaultGet.mockImplementation(async (key: string) => {
      if (key === 'openai-oauth') return JSON.stringify([1, 2, 3]);
      return null;
    });

    const result = await resolveCredential('openai');
    expect(result).toBeNull();
  });

  it('returns null when oauth data is null JSON', async () => {
    mockVaultGet.mockImplementation(async (key: string) => {
      if (key === 'openai-oauth') return 'null';
      return null;
    });

    const result = await resolveCredential('openai');
    expect(result).toBeNull();
  });

  it('uses generated env var name for unknown providers', async () => {
    mockVaultGet.mockResolvedValue(null);
    process.env['CUSTOM_PROVIDER_API_KEY'] = 'custom-key';

    const result = await resolveCredential('custom_provider');
    expect(result).not.toBeNull();
    expect(result?.kind).toBe('api_key');
    if (result?.kind === 'api_key') {
      expect(result.value).toBe('custom-key');
    }

    delete process.env['CUSTOM_PROVIDER_API_KEY'];
  });

  it('skips keychain fallback for non-anthropic providers', async () => {
    mockVaultGet.mockResolvedValue(null);

    const result = await resolveCredential('openai');
    expect(result).toBeNull();
  });
});

describe('resolveApiKey', () => {
  it('returns access token string for oauth credentials', async () => {
    const oauthData = {
      kind: 'oauth',
      accessToken: 'at-from-vault',
      refreshToken: 'rt',
      expiresAt: Date.now() + 3600000,
    };
    mockVaultGet.mockImplementation(async (key: string) => {
      if (key === 'anthropic-oauth') return JSON.stringify(oauthData);
      return null;
    });
    mockGetValidOAuthToken.mockResolvedValueOnce('refreshed-token');

    const result = await resolveApiKey('anthropic');
    expect(result).toBe('refreshed-token');
  });

  it('falls back to stored accessToken when getValidOAuthToken returns null', async () => {
    const oauthData = {
      kind: 'oauth',
      accessToken: 'stored-at',
      refreshToken: 'rt',
      expiresAt: Date.now() + 3600000,
    };
    mockVaultGet.mockImplementation(async (key: string) => {
      if (key === 'anthropic-oauth') return JSON.stringify(oauthData);
      return null;
    });
    mockGetValidOAuthToken.mockResolvedValueOnce(null);

    const result = await resolveApiKey('anthropic');
    expect(result).toBe('stored-at');
  });

  it('returns api key value for api_key credentials', async () => {
    mockVaultGet.mockImplementation(async (key: string) => {
      if (key === 'openai-api-key') return 'sk-api-key-value';
      return null;
    });

    const result = await resolveApiKey('openai');
    expect(result).toBe('sk-api-key-value');
  });

  it('throws when no credentials exist', async () => {
    mockVaultGet.mockResolvedValue(null);

    await expect(resolveApiKey('openai')).rejects.toThrow(/Missing credentials for openai/);
  });

  it('includes env var name in error message for unknown providers', async () => {
    mockVaultGet.mockResolvedValue(null);

    await expect(resolveApiKey('mistral')).rejects.toThrow(/MISTRAL_API_KEY/);
  });

  it('includes provider name in error message', async () => {
    mockVaultGet.mockResolvedValue(null);

    await expect(resolveApiKey('google')).rejects.toThrow(/Missing credentials for google/);
  });

  it('includes GOOGLE_API_KEY in error for google provider', async () => {
    mockVaultGet.mockResolvedValue(null);

    await expect(resolveApiKey('google')).rejects.toThrow(/GOOGLE_API_KEY/);
  });
});

describe('resolveCredential — env var mapping', () => {
  it('maps openrouter to OPENROUTER_API_KEY', async () => {
    mockVaultGet.mockResolvedValue(null);
    process.env['OPENROUTER_API_KEY'] = 'or-key';

    const result = await resolveCredential('openrouter');
    expect(result?.kind).toBe('api_key');
    if (result?.kind === 'api_key') {
      expect(result.value).toBe('or-key');
    }

    delete process.env['OPENROUTER_API_KEY'];
  });

  it('maps together to TOGETHER_API_KEY', async () => {
    mockVaultGet.mockResolvedValue(null);
    process.env['TOGETHER_API_KEY'] = 'tog-key';

    const result = await resolveCredential('together');
    expect(result?.kind).toBe('api_key');
    if (result?.kind === 'api_key') {
      expect(result.value).toBe('tog-key');
    }

    delete process.env['TOGETHER_API_KEY'];
  });

  it('maps groq to GROQ_API_KEY', async () => {
    mockVaultGet.mockResolvedValue(null);
    process.env['GROQ_API_KEY'] = 'groq-key';

    const result = await resolveCredential('groq');
    expect(result?.kind).toBe('api_key');
    if (result?.kind === 'api_key') {
      expect(result.value).toBe('groq-key');
    }

    delete process.env['GROQ_API_KEY'];
  });

  it('maps google to GOOGLE_API_KEY', async () => {
    mockVaultGet.mockResolvedValue(null);
    process.env['GOOGLE_API_KEY'] = 'google-key';

    const result = await resolveCredential('google');
    expect(result?.kind).toBe('api_key');
    if (result?.kind === 'api_key') {
      expect(result.value).toBe('google-key');
    }

    delete process.env['GOOGLE_API_KEY'];
  });
});

describe('resolveCredential — oauth from vault with all valid fields', () => {
  it('returns oauth with correct fields', async () => {
    const expiresAt = Date.now() + 3600000;
    mockVaultGet.mockImplementation(async (key: string) => {
      if (key === 'openai-oauth')
        return JSON.stringify({
          accessToken: 'oat',
          refreshToken: 'ort',
          expiresAt,
        });
      return null;
    });

    const result = await resolveCredential('openai');
    expect(result).toEqual({
      kind: 'oauth',
      accessToken: 'oat',
      refreshToken: 'ort',
      expiresAt,
    });
  });
});

describe('resolveCredential — Claude Code keychain fallback', () => {
  const originalPlatform = process.platform;

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  it('returns oauth from keychain on darwin when vault is empty', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    mockVaultGet.mockResolvedValue(null);

    const keychainData = {
      claudeAiOauth: {
        accessToken: 'keychain-at',
        refreshToken: 'keychain-rt',
        expiresAt: 9999999999,
      },
    };
    mockExecSync.mockReturnValue(JSON.stringify(keychainData));

    const result = await resolveCredential('anthropic');
    expect(result).toEqual({
      kind: 'oauth',
      accessToken: 'keychain-at',
      refreshToken: 'keychain-rt',
      expiresAt: 9999999999,
    });
  });

  it('returns null on non-darwin platform', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    mockVaultGet.mockResolvedValue(null);

    const result = await resolveCredential('anthropic');
    expect(result).toBeNull();
  });

  it('returns null when execSync throws', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    mockVaultGet.mockResolvedValue(null);
    mockExecSync.mockImplementation(() => {
      throw new Error('keychain not found');
    });

    const result = await resolveCredential('anthropic');
    expect(result).toBeNull();
  });

  it('returns null when execSync returns empty string', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    mockVaultGet.mockResolvedValue(null);
    mockExecSync.mockReturnValue('   ');

    const result = await resolveCredential('anthropic');
    expect(result).toBeNull();
  });

  it('returns null when claudeAiOauth key is missing', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    mockVaultGet.mockResolvedValue(null);
    mockExecSync.mockReturnValue(JSON.stringify({ someOtherKey: 'value' }));

    const result = await resolveCredential('anthropic');
    expect(result).toBeNull();
  });

  it('returns null when keychain oauth has wrong accessToken type', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    mockVaultGet.mockResolvedValue(null);
    mockExecSync.mockReturnValue(
      JSON.stringify({
        claudeAiOauth: { accessToken: 123, refreshToken: 'rt', expiresAt: 999 },
      }),
    );

    const result = await resolveCredential('anthropic');
    expect(result).toBeNull();
  });

  it('returns null when keychain oauth has wrong refreshToken type', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    mockVaultGet.mockResolvedValue(null);
    mockExecSync.mockReturnValue(
      JSON.stringify({
        claudeAiOauth: { accessToken: 'at', refreshToken: 42, expiresAt: 999 },
      }),
    );

    const result = await resolveCredential('anthropic');
    expect(result).toBeNull();
  });

  it('returns null when keychain oauth has wrong expiresAt type', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    mockVaultGet.mockResolvedValue(null);
    mockExecSync.mockReturnValue(
      JSON.stringify({
        claudeAiOauth: { accessToken: 'at', refreshToken: 'rt', expiresAt: 'nope' },
      }),
    );

    const result = await resolveCredential('anthropic');
    expect(result).toBeNull();
  });
});
