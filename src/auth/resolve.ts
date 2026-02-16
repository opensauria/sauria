import { vaultGet } from '../security/vault-key.js';
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

export async function resolveCredential(providerName: string): Promise<Credential | null> {
  const oauth = await resolveOAuthFromVault(providerName);
  if (oauth) return oauth;

  const vaultKey = await resolveApiKeyFromVault(providerName);
  if (vaultKey) return { kind: 'api_key', value: vaultKey };

  const envKey = resolveFromEnv(providerName);
  if (envKey) return { kind: 'api_key', value: envKey };

  return null;
}

export async function resolveApiKey(providerName: string): Promise<string> {
  const credential = await resolveCredential(providerName);
  if (!credential) {
    const envName = envVarName(providerName);
    throw new Error(
      `Missing credentials for ${providerName}. ` + `Run "openwind onboard" or set ${envName}.`,
    );
  }

  if (credential.kind === 'oauth') {
    return credential.accessToken;
  }

  return credential.value;
}
