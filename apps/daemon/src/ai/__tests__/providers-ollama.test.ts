import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../security/url-allowlist.js', () => ({
  secureFetch: vi.fn(),
  LLM_TIMEOUT_MS: 120_000,
}));
vi.mock('../../security/url-allowlist.js', () => ({
  secureFetch: vi.fn(),
  LLM_TIMEOUT_MS: 120_000,
}));

import { OllamaProvider } from '../providers/ollama.js';
import { secureFetch } from '../../security/url-allowlist.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('OllamaProvider', () => {
  it('sets name and supportsStreaming', () => {
    const provider = new OllamaProvider();
    expect(provider.name).toBe('ollama');
    expect(provider.supportsStreaming).toBe(true);
  });

  it('uses default URL when none provided', () => {
    const provider = new OllamaProvider();
    expect(provider).toBeDefined();
  });

  it('uses custom base URL', () => {
    const provider = new OllamaProvider('http://custom:1234');
    expect(provider).toBeDefined();
  });

  describe('chat', () => {
    it('throws on non-ok response', async () => {
      vi.mocked(secureFetch).mockResolvedValue({
        ok: false,
        status: 500,
        text: vi.fn().mockResolvedValue('Internal error'),
      } as never);

      const provider = new OllamaProvider();
      await expect(async () => {
        for await (const _ of provider.chat([{ role: 'user', content: 'hi' }], {
          model: 'llama3',
        })) {
          // consume
        }
      }).rejects.toThrow('Ollama API error 500');
    });

    it('streams NDJSON chat chunks', async () => {
      const ndjson =
        [
          '{"message":{"content":"Hi"},"done":false}',
          '{"message":{"content":" there"},"done":true}',
        ].join('\n') + '\n';

      const encoder = new TextEncoder();
      let readCount = 0;

      vi.mocked(secureFetch).mockResolvedValue({
        ok: true,
        body: {
          getReader: () => ({
            read: async () => {
              if (readCount === 0) {
                readCount++;
                return { value: encoder.encode(ndjson), done: false };
              }
              return { value: undefined, done: true };
            },
            releaseLock: vi.fn(),
          }),
        },
      } as never);

      const provider = new OllamaProvider();
      const chunks: Array<{ text: string; done: boolean }> = [];
      for await (const chunk of provider.chat([{ role: 'user', content: 'hi' }], {
        model: 'llama3',
      })) {
        chunks.push(chunk);
      }

      expect(chunks.some((c) => c.text === 'Hi')).toBe(true);
      expect(chunks.some((c) => c.done)).toBe(true);
    });

    it('handles null body', async () => {
      vi.mocked(secureFetch).mockResolvedValue({
        ok: true,
        body: null,
      } as never);

      const provider = new OllamaProvider();
      const chunks: Array<{ text: string; done: boolean }> = [];
      for await (const chunk of provider.chat([{ role: 'user', content: 'hi' }], {
        model: 'llama3',
      })) {
        chunks.push(chunk);
      }

      expect(chunks[chunks.length - 1]?.done).toBe(true);
    });

    it('includes system prompt in messages', async () => {
      vi.mocked(secureFetch).mockResolvedValue({
        ok: true,
        body: null,
      } as never);

      const provider = new OllamaProvider();
      for await (const _ of provider.chat([{ role: 'user', content: 'hi' }], {
        model: 'llama3',
        systemPrompt: 'be helpful',
      })) {
        // consume
      }

      const callArgs = vi.mocked(secureFetch).mock.calls[0];
      const body = JSON.parse(callArgs?.[1]?.body as string);
      expect(body.messages[0]).toEqual({ role: 'system', content: 'be helpful' });
    });
  });

  describe('embed', () => {
    it('returns embedding vector', async () => {
      vi.mocked(secureFetch).mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ embedding: [0.1, 0.2, 0.3] }),
      } as never);

      const provider = new OllamaProvider();
      const embedding = await provider.embed('hello');
      expect(embedding).toEqual([0.1, 0.2, 0.3]);
    });

    it('throws on non-ok response', async () => {
      vi.mocked(secureFetch).mockResolvedValue({
        ok: false,
        status: 404,
        text: vi.fn().mockResolvedValue('Model not found'),
      } as never);

      const provider = new OllamaProvider();
      await expect(provider.embed('hello')).rejects.toThrow('Ollama embeddings error 404');
    });

    it('throws on invalid response shape', async () => {
      vi.mocked(secureFetch).mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ something: 'else' }),
      } as never);

      const provider = new OllamaProvider();
      await expect(provider.embed('hello')).rejects.toThrow('Invalid embedding response');
    });

    it('throws when embedding is undefined', async () => {
      vi.mocked(secureFetch).mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ embedding: undefined }),
      } as never);

      const provider = new OllamaProvider();
      await expect(provider.embed('hello')).rejects.toThrow('Invalid embedding response');
    });
  });
});
