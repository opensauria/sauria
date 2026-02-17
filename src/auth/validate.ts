import { secureFetch } from '../security/url-allowlist.js';
import type { ValidationResult } from './types.js';
import { isOAuthToken } from './resolve.js';

async function validateAnthropicCredential(credential: string): Promise<ValidationResult> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };

  if (isOAuthToken(credential)) {
    headers['authorization'] = `Bearer ${credential}`;
  } else {
    headers['x-api-key'] = credential;
  }

  const response = await secureFetch('https://api.anthropic.com/v1/models', {
    method: 'GET',
    headers,
    signal: AbortSignal.timeout(10_000),
  });

  if (response.ok) {
    return { isValid: true, accountInfo: 'Anthropic API access confirmed' };
  }

  const body = await response.text();
  return { isValid: false, error: `Anthropic: ${response.status} — ${body.slice(0, 200)}` };
}

async function validateOpenAiCredential(apiKey: string): Promise<ValidationResult> {
  const response = await secureFetch('https://api.openai.com/v1/models', {
    method: 'GET',
    headers: { authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(10_000),
  });

  if (response.ok) {
    return { isValid: true, accountInfo: 'OpenAI API access confirmed' };
  }

  return { isValid: false, error: `OpenAI: ${response.status}` };
}

async function validateGoogleCredential(apiKey: string): Promise<ValidationResult> {
  const response = await secureFetch(
    `https://generativelanguage.googleapis.com/v1/models?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'GET',
      signal: AbortSignal.timeout(10_000),
    },
  );

  if (response.ok) {
    return { isValid: true, accountInfo: 'Google AI access confirmed' };
  }

  return { isValid: false, error: `Google: ${response.status}` };
}

export async function validateCredential(
  provider: string,
  credential: string,
): Promise<ValidationResult> {
  switch (provider) {
    case 'anthropic':
      return validateAnthropicCredential(credential);
    case 'openai':
    case 'openrouter':
    case 'together':
    case 'groq':
    case 'mistral':
      return validateOpenAiCredential(credential);
    case 'google':
      return validateGoogleCredential(credential);
    case 'ollama':
    case 'local':
      return { isValid: true, accountInfo: 'Local provider, no validation needed' };
    default:
      return { isValid: false, error: `Unknown provider: ${provider}` };
  }
}
