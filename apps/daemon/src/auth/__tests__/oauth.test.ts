import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';

vi.mock('../../security/url-allowlist.js', () => ({
  secureFetch: vi.fn(),
}));

vi.mock('../../security/vault-key.js', () => ({
  vaultGet: vi.fn(),
  vaultStore: vi.fn(),
}));

vi.mock('../../utils/logger.js', () => ({
  getLogger: () => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  }),
}));

import {
  generateCodeVerifier,
  generateCodeChallenge,
  buildAuthorizationUrl,
  exchangeAuthorizationCode,
  refreshOAuthToken,
  storeOAuthTokens,
  getValidOAuthToken,
  refreshOAuthTokenIfNeeded,
} from '../oauth.js';
import { secureFetch } from '../../security/url-allowlist.js';
import { vaultGet, vaultStore } from '../../security/vault-key.js';
import type { OAuthTokenResponse } from '../types.js';

const mockSecureFetch = vi.mocked(secureFetch);
const mockVaultGet = vi.mocked(vaultGet);
const mockVaultStore = vi.mocked(vaultStore);

function makeTokenResponse(overrides: Partial<OAuthTokenResponse> = {}): OAuthTokenResponse {
  return {
    access_token: 'sk-ant-oat01-test-access-token',
    refresh_token: 'test-refresh-token',
    expires_in: 3600,
    token_type: 'bearer',
    ...overrides,
  };
}

function mockFetchOk(body: unknown): void {
  mockSecureFetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response);
}

function mockFetchError(status: number, body: string): void {
  mockSecureFetch.mockResolvedValueOnce({
    ok: false,
    status,
    json: () => Promise.reject(new Error('not json')),
    text: () => Promise.resolve(body),
  } as unknown as Response);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('generateCodeVerifier', () => {
  it('returns a base64url-encoded string', () => {
    const verifier = generateCodeVerifier();
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('returns 64 characters (48 random bytes base64url-encoded)', () => {
    const verifier = generateCodeVerifier();
    expect(verifier).toHaveLength(64);
  });

  it('generates unique values on successive calls', () => {
    const a = generateCodeVerifier();
    const b = generateCodeVerifier();
    expect(a).not.toBe(b);
  });
});

describe('generateCodeChallenge', () => {
  it('returns SHA-256 hash of verifier as base64url', () => {
    const verifier = 'test-verifier-value';
    const expected = createHash('sha256').update(verifier).digest('base64url');
    expect(generateCodeChallenge(verifier)).toBe(expected);
  });

  it('produces different challenges for different verifiers', () => {
    const a = generateCodeChallenge('verifier-a');
    const b = generateCodeChallenge('verifier-b');
    expect(a).not.toBe(b);
  });

  it('returns only base64url-safe characters', () => {
    const challenge = generateCodeChallenge(generateCodeVerifier());
    expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe('buildAuthorizationUrl', () => {
  it('includes code_challenge and state params', () => {
    const url = buildAuthorizationUrl('my-challenge', 'my-state');
    const parsed = new URL(url);
    expect(parsed.searchParams.get('code_challenge')).toBe('my-challenge');
    expect(parsed.searchParams.get('state')).toBe('my-state');
  });

  it('uses S256 code challenge method', () => {
    const url = buildAuthorizationUrl('ch', 'st');
    const parsed = new URL(url);
    expect(parsed.searchParams.get('code_challenge_method')).toBe('S256');
  });

  it('includes response_type, client_id, redirect_uri, and scope', () => {
    const url = buildAuthorizationUrl('ch', 'st');
    const parsed = new URL(url);
    expect(parsed.searchParams.get('response_type')).toBe('code');
    expect(parsed.searchParams.get('client_id')).toBeTruthy();
    expect(parsed.searchParams.get('redirect_uri')).toBeTruthy();
    expect(parsed.searchParams.get('scope')).toBeTruthy();
  });

  it('points to the Anthropic authorize endpoint', () => {
    const url = buildAuthorizationUrl('ch', 'st');
    expect(url).toContain('claude.ai/oauth/authorize');
  });
});

describe('exchangeAuthorizationCode', () => {
  it('sends JSON body with grant_type authorization_code', async () => {
    const tokens = makeTokenResponse();
    mockFetchOk(tokens);

    await exchangeAuthorizationCode('my-code', 'my-verifier');

    expect(mockSecureFetch).toHaveBeenCalledOnce();
    const [, init] = mockSecureFetch.mock.calls[0]!;
    expect(init?.headers).toEqual(
      expect.objectContaining({ 'content-type': 'application/json' }),
    );
    const body = JSON.parse(init?.body as string) as Record<string, unknown>;
    expect(body['grant_type']).toBe('authorization_code');
    expect(body['code']).toBe('my-code');
    expect(body['code_verifier']).toBe('my-verifier');
  });

  it('splits code#state and sends only the code part', async () => {
    const tokens = makeTokenResponse();
    mockFetchOk(tokens);

    await exchangeAuthorizationCode('actual-code#some-state', 'verifier');

    const [, init] = mockSecureFetch.mock.calls[0]!;
    const body = JSON.parse(init?.body as string) as Record<string, unknown>;
    expect(body['code']).toBe('actual-code');
  });

  it('returns the parsed token response on success', async () => {
    const tokens = makeTokenResponse();
    mockFetchOk(tokens);

    const result = await exchangeAuthorizationCode('code', 'verifier');
    expect(result.access_token).toBe(tokens.access_token);
    expect(result.refresh_token).toBe(tokens.refresh_token);
  });

  it('throws on non-ok response with status and truncated body', async () => {
    mockFetchError(400, 'Bad request details');

    await expect(exchangeAuthorizationCode('code', 'verifier')).rejects.toThrow(
      /OAuth token exchange failed \(400\)/,
    );
  });
});

describe('refreshOAuthToken', () => {
  it('sends JSON body with grant_type refresh_token', async () => {
    mockFetchOk(makeTokenResponse());

    await refreshOAuthToken('my-refresh-token');

    const [, init] = mockSecureFetch.mock.calls[0]!;
    const body = JSON.parse(init?.body as string) as Record<string, unknown>;
    expect(body['grant_type']).toBe('refresh_token');
    expect(body['refresh_token']).toBe('my-refresh-token');
  });

  it('throws on non-ok response', async () => {
    mockFetchError(401, 'Invalid refresh token');

    await expect(refreshOAuthToken('bad-token')).rejects.toThrow(
      /OAuth token refresh failed \(401\)/,
    );
  });
});

describe('storeOAuthTokens', () => {
  it('stores credential JSON in vault under provider-oauth key', async () => {
    const tokens = makeTokenResponse({ expires_in: 7200 });

    const beforeStore = Date.now();
    await storeOAuthTokens('anthropic', tokens);

    expect(mockVaultStore).toHaveBeenCalledOnce();
    const [key, value] = mockVaultStore.mock.calls[0]!;
    expect(key).toBe('anthropic-oauth');

    const stored = JSON.parse(value) as Record<string, unknown>;
    expect(stored['kind']).toBe('oauth');
    expect(stored['accessToken']).toBe(tokens.access_token);
    expect(stored['refreshToken']).toBe(tokens.refresh_token);
    expect(stored['expiresAt']).toBeGreaterThanOrEqual(beforeStore + 7200 * 1000);
  });
});

describe('getValidOAuthToken', () => {
  it('returns null when no token is stored in vault', async () => {
    mockVaultGet.mockResolvedValueOnce(null);
    const result = await getValidOAuthToken('anthropic');
    expect(result).toBeNull();
  });

  it('returns cached access token when not expired', async () => {
    const credential = {
      kind: 'oauth',
      accessToken: 'cached-token',
      refreshToken: 'refresh',
      expiresAt: Date.now() + 60 * 60 * 1000, // 1 hour from now
    };
    mockVaultGet.mockResolvedValueOnce(JSON.stringify(credential));

    const result = await getValidOAuthToken('anthropic');
    expect(result).toBe('cached-token');
    expect(mockSecureFetch).not.toHaveBeenCalled();
  });

  it('refreshes token when within 5-minute buffer of expiry', async () => {
    vi.useFakeTimers();
    const credential = {
      kind: 'oauth',
      accessToken: 'old-token',
      refreshToken: 'refresh-tok',
      expiresAt: Date.now() + 2 * 60 * 1000, // 2 minutes — within 5-min buffer
    };
    mockVaultGet.mockResolvedValueOnce(JSON.stringify(credential));
    mockFetchOk(makeTokenResponse({ access_token: 'new-token' }));
    mockVaultStore.mockResolvedValueOnce(undefined);

    const result = await getValidOAuthToken('anthropic');
    expect(result).toBe('new-token');
    vi.useRealTimers();
  });

  it('retries up to 3 times on refresh failure then throws', async () => {
    const credential = {
      kind: 'oauth',
      accessToken: 'old-token',
      refreshToken: 'refresh-tok',
      expiresAt: Date.now() + 1000, // effectively expired (within buffer)
    };
    mockVaultGet.mockResolvedValueOnce(JSON.stringify(credential));
    mockFetchError(500, 'server error');
    mockFetchError(500, 'server error');
    mockFetchError(500, 'server error');

    await expect(getValidOAuthToken('anthropic')).rejects.toThrow(/OAuth token refresh failed/);
    expect(mockSecureFetch).toHaveBeenCalledTimes(3);
  });

  it('returns null for malformed vault data', async () => {
    mockVaultGet.mockResolvedValueOnce(JSON.stringify({ bad: 'data' }));
    const result = await getValidOAuthToken('anthropic');
    expect(result).toBeNull();
  });
});

describe('refreshOAuthTokenIfNeeded', () => {
  it('calls onRefreshFailure callback when refresh throws', async () => {
    const credential = {
      kind: 'oauth',
      accessToken: 'old',
      refreshToken: 'refresh',
      expiresAt: Date.now() + 1000,
    };
    mockVaultGet.mockResolvedValueOnce(JSON.stringify(credential));
    mockFetchError(500, 'error');
    mockFetchError(500, 'error');
    mockFetchError(500, 'error');

    const onFailure = vi.fn();
    await refreshOAuthTokenIfNeeded('anthropic', onFailure);

    expect(onFailure).toHaveBeenCalledWith('anthropic', expect.stringContaining('OAuth'));
  });

  it('does not call onRefreshFailure when token is valid', async () => {
    const credential = {
      kind: 'oauth',
      accessToken: 'valid-token',
      refreshToken: 'refresh',
      expiresAt: Date.now() + 60 * 60 * 1000,
    };
    mockVaultGet.mockResolvedValueOnce(JSON.stringify(credential));

    const onFailure = vi.fn();
    await refreshOAuthTokenIfNeeded('anthropic', onFailure);

    expect(onFailure).not.toHaveBeenCalled();
  });
});
