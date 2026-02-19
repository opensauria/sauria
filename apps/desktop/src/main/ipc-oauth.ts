/**
 * Anthropic OAuth PKCE flow — start and complete handlers.
 */

import { ipcMain, shell } from 'electron';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { paths } from '@opensauria/config';
import { vaultStore } from '@opensauria/vault';
import { restartDaemon } from './daemon-manager';

const ANTHROPIC_OAUTH = {
  authorizeUrl: 'https://claude.ai/oauth/authorize',
  tokenUrl: 'https://platform.claude.com/v1/oauth/token',
  clientId: '9d1c250a-e61b-44d9-88ed-5944d1962f5e',
  scopes: 'user:inference user:profile',
  redirectUri: 'https://platform.claude.com/oauth/code/callback',
} as const;

let pendingOAuthVerifier: string | null = null;
let pendingOAuthState: string | null = null;

function readConfig(): Record<string, unknown> {
  if (!existsSync(paths.config)) return {};
  try {
    return JSON.parse(readFileSync(paths.config, 'utf-8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function registerOAuthHandlers(): void {
  ipcMain.handle('start-oauth', () => {
    const verifier = randomBytes(48).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const state = randomBytes(16).toString('hex');
    pendingOAuthVerifier = verifier;
    pendingOAuthState = state;

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: ANTHROPIC_OAUTH.clientId,
      redirect_uri: ANTHROPIC_OAUTH.redirectUri,
      scope: ANTHROPIC_OAUTH.scopes,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state,
    });
    shell.openExternal(`${ANTHROPIC_OAUTH.authorizeUrl}?${params.toString()}`);
    return { started: true };
  });

  ipcMain.handle('complete-oauth', async (_event, code: string) => {
    if (!pendingOAuthVerifier) {
      return { success: false, error: 'No pending OAuth flow. Click "Sign in" first.' };
    }

    try {
      const parts = code.split('#');
      const actualCode = parts[0];
      const codeState = parts[1] ?? pendingOAuthState;
      const verifier = pendingOAuthVerifier;
      pendingOAuthVerifier = null;
      pendingOAuthState = null;

      const tokenRes = await fetch(ANTHROPIC_OAUTH.tokenUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'authorization_code',
          client_id: ANTHROPIC_OAUTH.clientId,
          code: actualCode,
          state: codeState,
          redirect_uri: ANTHROPIC_OAUTH.redirectUri,
          code_verifier: verifier,
        }),
        signal: AbortSignal.timeout(15_000),
      });

      if (!tokenRes.ok) {
        const text = await tokenRes.text();
        return {
          success: false,
          error: `Token exchange failed (${tokenRes.status}): ${text.slice(0, 200)}`,
        };
      }

      const tokens = (await tokenRes.json()) as {
        access_token: string;
        refresh_token: string;
        expires_in: number;
      };

      const credential = JSON.stringify({
        kind: 'oauth',
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: Date.now() + tokens.expires_in * 1000,
      });
      await vaultStore('anthropic-oauth', credential);

      const config = readConfig();
      config['auth'] = { anthropic: { method: 'oauth' } };
      writeFileSync(paths.config, JSON.stringify(config, null, 2), 'utf-8');

      restartDaemon();
      return { success: true };
    } catch (err) {
      pendingOAuthVerifier = null;
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });
}
