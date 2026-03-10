import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { detectLocalProviders, findRunningLocalProvider } from '../detect-local-providers.js';

describe('detectLocalProviders', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('returns all three local providers', async () => {
    fetchSpy.mockRejectedValue(new Error('Connection refused'));

    const providers = await detectLocalProviders();

    expect(providers).toHaveLength(3);
    expect(providers.map((p) => p.name)).toEqual(['Ollama', 'LM Studio', 'Open WebUI']);
  });

  it('marks provider as running when /v1/models responds ok', async () => {
    fetchSpy.mockImplementation(async (url) => {
      if (typeof url === 'string' && url.includes('11434')) {
        return new Response('{}', { status: 200 });
      }
      throw new Error('Connection refused');
    });

    const providers = await detectLocalProviders();
    const ollama = providers.find((p) => p.name === 'Ollama');

    expect(ollama?.running).toBe(true);
  });

  it('marks provider as running when base url responds (fallback)', async () => {
    fetchSpy.mockImplementation(async (url) => {
      const urlStr = typeof url === 'string' ? url : url.toString();
      if (urlStr.includes('1234/v1/models')) {
        throw new Error('Not found');
      }
      if (urlStr.includes('1234')) {
        return new Response('OK', { status: 200 });
      }
      throw new Error('Connection refused');
    });

    const providers = await detectLocalProviders();
    const lmStudio = providers.find((p) => p.name === 'LM Studio');

    expect(lmStudio?.running).toBe(true);
  });

  it('treats 404 on base url as running', async () => {
    fetchSpy.mockImplementation(async (url) => {
      const urlStr = typeof url === 'string' ? url : url.toString();
      if (urlStr.includes('11434/v1/models')) {
        throw new Error('Not found');
      }
      if (urlStr.includes('11434')) {
        return new Response('Not Found', { status: 404 });
      }
      throw new Error('Connection refused');
    });

    const providers = await detectLocalProviders();
    const ollama = providers.find((p) => p.name === 'Ollama');

    expect(ollama?.running).toBe(true);
  });

  it('marks provider as not running when all requests fail', async () => {
    fetchSpy.mockRejectedValue(new Error('Connection refused'));

    const providers = await detectLocalProviders();

    for (const provider of providers) {
      expect(provider.running).toBe(false);
    }
  });
});

describe('findRunningLocalProvider', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('returns first running provider', async () => {
    fetchSpy.mockImplementation(async (url) => {
      if (typeof url === 'string' && url.includes('11434')) {
        return new Response('{}', { status: 200 });
      }
      throw new Error('Connection refused');
    });

    const provider = await findRunningLocalProvider();

    expect(provider).not.toBeNull();
    expect(provider?.name).toBe('Ollama');
  });

  it('returns null when no providers are running', async () => {
    fetchSpy.mockRejectedValue(new Error('Connection refused'));

    const provider = await findRunningLocalProvider();

    expect(provider).toBeNull();
  });
});
