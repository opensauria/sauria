import { describe, it, expect, vi } from 'vitest';

vi.mock('../providers/anthropic.js', () => ({
  AnthropicProvider: class {
    readonly name = 'anthropic';
    readonly supportsStreaming = true;
  },
}));
vi.mock('../providers/openai.js', () => ({
  OpenAIProvider: class {
    readonly name: string;
    readonly supportsStreaming = true;
    constructor(_key: string, baseUrl?: string) {
      this.name = baseUrl ? 'openai-compatible' : 'openai';
    }
  },
}));
vi.mock('../providers/google.js', () => ({
  GoogleProvider: class {
    readonly name = 'google';
    readonly supportsStreaming = true;
  },
}));
vi.mock('../providers/ollama.js', () => ({
  OllamaProvider: class {
    readonly name = 'ollama';
    readonly supportsStreaming = true;
  },
}));

import { createProvider, collectStream, PROVIDER_BASE_URLS } from '../router-helpers.js';

describe('PROVIDER_BASE_URLS', () => {
  it('contains known compatible providers', () => {
    expect(PROVIDER_BASE_URLS['openrouter']).toBeDefined();
    expect(PROVIDER_BASE_URLS['together']).toBeDefined();
    expect(PROVIDER_BASE_URLS['groq']).toBeDefined();
    expect(PROVIDER_BASE_URLS['mistral']).toBeDefined();
  });
});

describe('createProvider', () => {
  it('creates AnthropicProvider for anthropic', () => {
    const provider = createProvider('anthropic', 'key');
    expect(provider.name).toBe('anthropic');
  });

  it('creates OpenAIProvider for openai', () => {
    const provider = createProvider('openai', 'key');
    expect(provider.name).toBe('openai');
  });

  it('creates GoogleProvider for google', () => {
    const provider = createProvider('google', 'key');
    expect(provider.name).toBe('google');
  });

  it('creates OllamaProvider for ollama', () => {
    const provider = createProvider('ollama', '');
    expect(provider.name).toBe('ollama');
  });

  it('creates OllamaProvider for local alias', () => {
    const provider = createProvider('local', '');
    expect(provider.name).toBe('ollama');
  });

  it('creates OpenAI-compatible provider for openrouter', () => {
    const provider = createProvider('openrouter', 'key', 'https://openrouter.ai/api/v1');
    expect(provider.name).toBe('openai-compatible');
  });

  it('creates OpenAI-compatible for together', () => {
    const provider = createProvider('together', 'key', 'https://api.together.xyz/v1');
    expect(provider.name).toBe('openai-compatible');
  });

  it('creates OpenAI-compatible for groq', () => {
    const provider = createProvider('groq', 'key', 'https://api.groq.com/openai/v1');
    expect(provider.name).toBe('openai-compatible');
  });

  it('creates OpenAI-compatible for mistral', () => {
    const provider = createProvider('mistral', 'key', 'https://api.mistral.ai/v1');
    expect(provider.name).toBe('openai-compatible');
  });

  it('throws for unknown provider', () => {
    expect(() => createProvider('unknown', 'key')).toThrow('Unknown provider');
  });
});

describe('collectStream', () => {
  it('collects all chunks into a single string', async () => {
    async function* fakeStream() {
      yield { text: 'a', done: false };
      yield { text: 'b', done: false };
      yield { text: '', done: true };
    }
    const result = await collectStream(fakeStream());
    expect(result).toBe('ab');
  });

  it('returns empty string for empty stream', async () => {
    async function* empty() {
      yield { text: '', done: true };
    }
    const result = await collectStream(empty());
    expect(result).toBe('');
  });
});
