import { execSync } from 'node:child_process';
import { userInfo } from 'node:os';
import { vaultGet } from '../security/vault-key.js';
import { getValidOAuthToken } from './oauth.js';
import type { Credential, OAuthCredential } from './types.js';

const ENV_MAP: Readonly<Record<string, string>> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  google: 'GOOGLE_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  together: 'TOGETHER_API_KEY',
  groq: 'GROQ_API_KEY',
  mistral: 'MISTRAL_API_KEY',
};

const OAUTH_TOKEN_PREFIX = 'sk-ant-oat01-';

export function isOAuthToken(value: string): boolean {
  return value.startsWith(OAUTH_TOKEN_PREFIX);
}

function envVarName(providerName: string): string {
  return ENV_MAP[providerName] ?? `${providerName.toUpperCase()}_API_KEY`;
}

function resolveFromEnv(providerName: string): string | null {
  return process.env[envVarName(providerName)] ?? null;
}

async function resolveOAuthFromVault(providerName: string): Promise<OAuthCredential | null> {
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

async function resolveApiKeyFromVault(providerName: string): Promise<string | null> {
  return vaultGet(`${providerName}-api-key`);
}

function resolveFromClaudeCodeKeychain(): OAuthCredential | null {
  if (process.platform !== 'darwin') return null;

  try {
    const account = userInfo().username;
    const raw = execSync(
      `security find-generic-password -s "Claude Code-credentials" -a "${account}" -w`,
      { encoding: 'utf-8', timeout: 5_000, stdio: ['pipe', 'pipe', 'pipe'] },
    ).trim();
    if (!raw) return null;

    const data = JSON.parse(raw) as Record<string, unknown>;
    const oauth = data['claudeAiOauth'] as Record<string, unknown> | undefined;
    if (!oauth) return null;

    const { accessToken, refreshToken, expiresAt } = oauth;
    if (
      typeof accessToken !== 'string' ||
      typeof refreshToken !== 'string' ||
      typeof expiresAt !== 'number'
    ) {
      return null;
    }

    return { kind: 'oauth', accessToken, refreshToken, expiresAt };
  } catch {
    return null;
  }
}

export async function resolveCredential(providerName: string): Promise<Credential | null> {
  const oauth = await resolveOAuthFromVault(providerName);
  if (oauth) return oauth;

  const vaultKey = await resolveApiKeyFromVault(providerName);
  if (vaultKey) return { kind: 'api_key', value: vaultKey };

  const envKey = resolveFromEnv(providerName);
  if (envKey) return { kind: 'api_key', value: envKey };

  if (providerName === 'anthropic') {
    const keychainOAuth = resolveFromClaudeCodeKeychain();
    if (keychainOAuth) return keychainOAuth;
  }

  return null;
}

export async function resolveApiKey(providerName: string): Promise<string> {
  const credential = await resolveCredential(providerName);
  if (!credential) {
    const envName = envVarName(providerName);
    throw new Error(
      `Missing credentials for ${providerName}. ` + `Run "opensauria onboard" or set ${envName}.`,
    );
  }

  if (credential.kind === 'oauth') {
    const token = await getValidOAuthToken(providerName);
    return token ?? credential.accessToken;
  }

  return credential.value;
}
