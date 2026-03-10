import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SauriaConfig } from '../../config/schema.js';
import type { LLMProvider, StreamChunk, ChatMessage, ChatOptions } from '../providers/base.js';
import { ModelRouter } from '../router.js';

function createMockProvider(name = 'mock'): LLMProvider {
  return {
    name,
    supportsStreaming: true,
    async *chat(_messages: ChatMessage[], _options: ChatOptions): AsyncGenerator<StreamChunk> {
      yield { text: 'Hello', done: false };
      yield { text: ' world', done: true };
    },
  };
}

function createFailingProvider(name = 'failing'): LLMProvider {
  return {
    name,
    supportsStreaming: true,
    async *chat(): AsyncGenerator<StreamChunk> {
      throw new Error('provider failure');
    },
  };
}

function createMinimalConfig(overrides?: Partial<SauriaConfig['models']>): SauriaConfig {
  return {
    models: {
      extraction: { provider: 'anthropic', model: 'test-extract', ...overrides?.extraction },
      reasoning: { provider: 'anthropic', model: 'test-reason', ...overrides?.reasoning },
      deep: { provider: 'anthropic', model: 'test-deep', ...overrides?.deep },
      embeddings: { provider: 'local', model: 'test-embed', ...overrides?.embeddings },
    },
  } as SauriaConfig;
}

vi.mock('../router-helpers.js', () => ({
  createProvider: vi.fn((_name: string, _key: string, _url?: string): LLMProvider => createMockProvider(_name)),
  collectStream: vi.fn(async (stream: AsyncGenerator<StreamChunk>): Promise<string> => {
    let result = '';
    for await (const chunk of stream) {
      result += chunk.text;
    }
    return result;
  }),
  PROVIDER_BASE_URLS: {
    openrouter: 'https://openrouter.ai/api/v1',
    together: 'https://api.together.xyz/v1',
    groq: 'https://api.groq.com/openai/v1',
    mistral: 'https://api.mistral.ai/v1',
  },
}));

describe('ModelRouter', () => {
  let router: ModelRouter;
  let getApiKey: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    getApiKey = vi.fn().mockResolvedValue('test-key');
    router = new ModelRouter(createMinimalConfig(), getApiKey);
  });

  describe('initialization', () => {
    it('creates a router instance', () => {
      expect(router).toBeInstanceOf(ModelRouter);
    });

    it('does not request API key for ollama provider', async () => {
      const config = createMinimalConfig({
        extraction: { provider: 'ollama', model: 'llama3' },
      });
      const ollamaRouter = new ModelRouter(config, getApiKey);

      const { createProvider } = await import('../router-helpers.js');
      const mockCreateProvider = vi.mocked(createProvider);
      mockCreateProvider.mockReturnValue(createMockProvider('ollama'));

      const validJson = JSON.stringify({
        entities: [],
        relations: [],
        facts: [],
      });

      const { collectStream } = await import('../router-helpers.js');
      vi.mocked(collectStream).mockResolvedValue(validJson);

      await ollamaRouter.extract('test content');
      expect(getApiKey).not.toHaveBeenCalled();
    });

    it('does not request API key for local provider', async () => {
      const config = createMinimalConfig({
        extraction: { provider: 'local', model: 'local-model' },
      });
      const localRouter = new ModelRouter(config, getApiKey);

      const { createProvider, collectStream } = await import('../router-helpers.js');
      vi.mocked(createProvider).mockReturnValue(createMockProvider('local'));
      vi.mocked(collectStream).mockResolvedValue(
        JSON.stringify({ entities: [], relations: [], facts: [] }),
      );

      await localRouter.extract('test');
      expect(getApiKey).not.toHaveBeenCalled();
    });
  });

  describe('cost tracking', () => {
    it('invokes cost callback after extraction', async () => {
      const costCallback = vi.fn();
      router.onCostIncurred(costCallback);

      const { collectStream } = await import('../router-helpers.js');
      vi.mocked(collectStream).mockResolvedValue(
        JSON.stringify({ entities: [], relations: [], facts: [] }),
      );

      await router.extract('test content');
      expect(costCallback).toHaveBeenCalledWith('test-extract', expect.any(Number));
    });

    it('estimates cost based on response length', async () => {
      const costCallback = vi.fn();
      router.onCostIncurred(costCallback);

      const response = JSON.stringify({ entities: [], relations: [], facts: [] });
      const { collectStream } = await import('../router-helpers.js');
      vi.mocked(collectStream).mockResolvedValue(response);

      await router.extract('test');
      const expectedCost = response.length * 0.000001;
      expect(costCallback).toHaveBeenCalledWith('test-extract', expectedCost);
    });

    it('does not throw when no cost callback is set', async () => {
      const { collectStream } = await import('../router-helpers.js');
      vi.mocked(collectStream).mockResolvedValue(
        JSON.stringify({ entities: [], relations: [], facts: [] }),
      );

      await expect(router.extract('test')).resolves.toBeDefined();
    });
  });

  describe('rate limiting', () => {
    it('allows extraction calls within the rate limit', async () => {
      const { collectStream } = await import('../router-helpers.js');
      vi.mocked(collectStream).mockResolvedValue(
        JSON.stringify({ entities: [], relations: [], facts: [] }),
      );

      await expect(router.extract('test')).resolves.toBeDefined();
    });

    it('throws when extraction rate limit is exhausted', async () => {
      const { collectStream } = await import('../router-helpers.js');
      vi.mocked(collectStream).mockResolvedValue(
        JSON.stringify({ entities: [], relations: [], facts: [] }),
      );

      for (let i = 0; i < 100; i++) {
        await router.extract('test');
      }

      await expect(router.extract('test')).rejects.toThrow('Extraction rate limit exceeded');
    });

    it('throws when deep analysis rate limit is exhausted', async () => {
      for (let i = 0; i < 10; i++) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for await (const _chunk of router.deepAnalyze([{ role: 'user', content: 'test' }])) {
          // consume
        }
      }

      const gen = router.deepAnalyze([{ role: 'user', content: 'test' }]);
      await expect(gen.next()).rejects.toThrow('Deep analysis rate limit exceeded');
    });
  });

  describe('circuit breaker', () => {
    it('reports provider as available initially', () => {
      expect(router.isProviderAvailable('anthropic')).toBe(true);
    });

    it('reports unknown provider as available', () => {
      expect(router.isProviderAvailable('nonexistent')).toBe(true);
    });

    it('opens circuit after repeated failures in extract', async () => {
      const { createProvider, collectStream } = await import('../router-helpers.js');
      vi.mocked(createProvider).mockReturnValue(createFailingProvider());
      vi.mocked(collectStream).mockRejectedValue(new Error('provider failure'));

      for (let i = 0; i < 3; i++) {
        try {
          await router.extract('test');
        } catch {
          // expected
        }
      }

      expect(router.isProviderAvailable('anthropic')).toBe(false);
    });

    it('rejects calls when circuit is open', async () => {
      const { createProvider, collectStream } = await import('../router-helpers.js');
      vi.mocked(createProvider).mockReturnValue(createFailingProvider());
      vi.mocked(collectStream).mockRejectedValue(new Error('provider failure'));

      for (let i = 0; i < 3; i++) {
        try {
          await router.extract('test');
        } catch {
          // expected
        }
      }

      await expect(router.extract('test')).rejects.toThrow('Circuit open');
    });
  });

  describe('provider resolution', () => {
    it('caches providers after first resolution', async () => {
      const { createProvider, collectStream } = await import('../router-helpers.js');
      const mockCreate = vi.mocked(createProvider);
      mockCreate.mockReturnValue(createMockProvider());
      vi.mocked(collectStream).mockResolvedValue(
        JSON.stringify({ entities: [], relations: [], facts: [] }),
      );

      await router.extract('first');
      await router.extract('second');

      expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    it('getProvider returns a cached provider on repeated calls', () => {
      const provider1 = router.getProvider('anthropic', 'key1');
      const provider2 = router.getProvider('anthropic', 'key1');
      expect(provider1).toBe(provider2);
    });

    it('uses different cache keys for different base URLs', async () => {
      const helpers = await import('../router-helpers.js');
      let callCount = 0;
      vi.mocked(helpers.createProvider).mockImplementation((_name, _key, _url) => {
        callCount++;
        return createMockProvider(`mock-${callCount}`);
      });

      const freshRouter = new ModelRouter(createMinimalConfig(), getApiKey);
      const provider1 = freshRouter.getProvider('openai', 'key', 'https://a.com');
      const provider2 = freshRouter.getProvider('openai', 'key', 'https://b.com');
      expect(provider1.name).not.toBe(provider2.name);
    });
  });
});
