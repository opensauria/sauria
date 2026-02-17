import { createHash, randomBytes } from 'node:crypto';
import { secureFetch } from '../security/url-allowlist.js';
import { vaultGet, vaultStore } from '../security/vault-key.js';
import type { OAuthCredential, OAuthTokenResponse } from './types.js';

const ANTHROPIC_OAUTH = {
  authorizeUrl: 'https://claude.ai/oauth/authorize',
  tokenUrl: 'https://console.anthropic.com/v1/oauth/token',
  clientId: '9d1c250a-e61b-44d9-88ed-5944d1962f5e',
  scopes: 'org:create_api_key user:profile user:inference',
  redirectUri: 'https://console.anthropic.com/oauth/code/callback',
} as const;

function base64url(buffer: Buffer): string {
  return buffer.toString('base64url');
}

export function generateCodeVerifier(): string {
  return base64url(randomBytes(48));
}

export function generateCodeChallenge(verifier: string): string {
  return base64url(createHash('sha256').update(verifier).digest());
}

export function buildAuthorizationUrl(codeChallenge: string, state: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: ANTHROPIC_OAUTH.clientId,
    redirect_uri: ANTHROPIC_OAUTH.redirectUri,
    scope: ANTHROPIC_OAUTH.scopes,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
  });
  return `${ANTHROPIC_OAUTH.authorizeUrl}?${params.toString()}`;
}

export async function exchangeAuthorizationCode(
  code: string,
  codeVerifier: string,
): Promise<OAuthTokenResponse> {
  const actualCode = code.includes('#') ? code.split('#')[0] : code;

  const response = await secureFetch(ANTHROPIC_OAUTH.tokenUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: ANTHROPIC_OAUTH.clientId,
      code: actualCode,
      redirect_uri: ANTHROPIC_OAUTH.redirectUri,
      code_verifier: codeVerifier,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OAuth token exchange failed (${response.status}): ${text.slice(0, 300)}`);
  }

  return response.json() as Promise<OAuthTokenResponse>;
}

export async function refreshOAuthToken(refreshToken: string): Promise<OAuthTokenResponse> {
  const response = await secureFetch(ANTHROPIC_OAUTH.tokenUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: ANTHROPIC_OAUTH.clientId,
      refresh_token: refreshToken,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OAuth token refresh failed (${response.status}): ${text.slice(0, 300)}`);
  }

  return response.json() as Promise<OAuthTokenResponse>;
}

export async function storeOAuthTokens(
  providerName: string,
  tokens: OAuthTokenResponse,
): Promise<void> {
  const credential: OAuthCredential = {
    kind: 'oauth',
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: Date.now() + tokens.expires_in * 1000,
  };
  await vaultStore(`${providerName}-oauth`, JSON.stringify(credential));
}

async function loadOAuthFromVault(providerName: string): Promise<OAuthCredential | null> {
  const raw = await vaultGet(`${providerName}-oauth`);
  if (!raw) return null;

  const parsed: unknown = JSON.parse(raw);
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('accessToken' in parsed) ||
    !('refreshToken' in parsed) ||
    !('expiresAt' in parsed)
  ) {
    return null;
  }

  const { accessToken, refreshToken, expiresAt } = parsed as Record<string, unknown>;
  if (
    typeof accessToken !== 'string' ||
    typeof refreshToken !== 'string' ||
    typeof expiresAt !== 'number'
  ) {
    return null;
  }

  return { kind: 'oauth', accessToken, refreshToken, expiresAt };
}

const REFRESH_BUFFER_MS = 5 * 60 * 1000;

export async function getValidOAuthToken(providerName: string): Promise<string | null> {
  const stored = await loadOAuthFromVault(providerName);
  if (!stored) return null;

  if (stored.expiresAt - REFRESH_BUFFER_MS > Date.now()) {
    return stored.accessToken;
  }

  const refreshed = await refreshOAuthToken(stored.refreshToken);
  await storeOAuthTokens(providerName, refreshed);
  return refreshed.access_token;
}

export async function refreshOAuthTokenIfNeeded(providerName: string): Promise<void> {
  try {
    await getValidOAuthToken(providerName);
  } catch {
    // Refresh failure is non-fatal for daemon; token will be re-fetched on next request
  }
}
