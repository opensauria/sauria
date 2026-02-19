export class BlockedDomainError extends Error {
  override readonly name = 'BlockedDomainError';

  constructor(hostname: string) {
    super(`Outbound request blocked: "${hostname}" is not in the allowlist`);
  }
}

export const OUTBOUND_ALLOWLIST: ReadonlySet<string> = new Set([
  'api.anthropic.com',
  'api.openai.com',
  'generativelanguage.googleapis.com',
  'api.mistral.ai',
  'api.groq.com',
  'api.together.xyz',
  'openrouter.ai',
  'localhost',
  'api.telegram.org',
  'accounts.google.com',
  'oauth2.googleapis.com',
  'login.microsoftonline.com',
  'claude.ai',
  'console.anthropic.com',
  'platform.claude.com',
  'slack.com',
  'discord.com',
]);

function isAllowedHostname(hostname: string): boolean {
  return OUTBOUND_ALLOWLIST.has(hostname);
}

export async function secureFetch(url: string, options?: RequestInit): Promise<Response> {
  const parsed = new URL(url);

  if (!isAllowedHostname(parsed.hostname)) {
    throw new BlockedDomainError(parsed.hostname);
  }

  const timeoutSignal = AbortSignal.timeout(30_000);
  const mergedSignal = options?.signal
    ? AbortSignal.any([timeoutSignal, options.signal])
    : timeoutSignal;

  return fetch(url, { ...options, signal: mergedSignal });
}
