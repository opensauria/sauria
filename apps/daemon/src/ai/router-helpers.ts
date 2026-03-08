import type { LLMProvider, StreamChunk } from './providers/base.js';
import { AnthropicProvider } from './providers/anthropic.js';
import { OpenAIProvider } from './providers/openai.js';
import { GoogleProvider } from './providers/google.js';
import { OllamaProvider } from './providers/ollama.js';

export const PROVIDER_BASE_URLS: Readonly<Record<string, string>> = {
  openrouter: 'https://openrouter.ai/api/v1',
  together: 'https://api.together.xyz/v1',
  groq: 'https://api.groq.com/openai/v1',
  mistral: 'https://api.mistral.ai/v1',
};

export function createProvider(
  providerName: string,
  apiKey: string,
  baseUrl?: string,
): LLMProvider {
  switch (providerName) {
    case 'anthropic':
      return new AnthropicProvider(apiKey);
    case 'openai':
      return new OpenAIProvider(apiKey, baseUrl);
    case 'google':
      return new GoogleProvider(apiKey);
    case 'ollama':
    case 'local':
      return new OllamaProvider(baseUrl);
    case 'openrouter':
    case 'together':
    case 'groq':
    case 'mistral':
      return new OpenAIProvider(apiKey, baseUrl);
    default:
      throw new Error(`Unknown provider: ${providerName}`);
  }
}

export async function collectStream(stream: AsyncGenerator<StreamChunk>): Promise<string> {
  let result = '';
  for await (const chunk of stream) {
    result += chunk.text;
  }
  return result;
}
