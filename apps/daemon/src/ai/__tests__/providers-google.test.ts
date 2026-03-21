import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../security/url-allowlist.js', () => ({
  secureFetch: vi.fn(),
  LLM_TIMEOUT_MS: 120_000,
}));
vi.mock('../../security/url-allowlist.js', () => ({
  secureFetch: vi.fn(),
  LLM_TIMEOUT_MS: 120_000,
}));

import { GoogleProvider } from '../providers/google.js';
import { secureFetch } from '../../security/url-allowlist.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GoogleProvider', () => {
  it('sets name and supportsStreaming', () => {
    const provider = new GoogleProvider('key');
    expect(provider.name).toBe('google');
    expect(provider.supportsStreaming).toBe(true);
  });

  it('throws on non-ok response', async () => {
    vi.mocked(secureFetch).mockResolvedValue({
      ok: false,
      status: 400,
      text: vi.fn().mockResolvedValue('Bad request'),
    } as never);

    const provider = new GoogleProvider('key');
    await expect(async () => {
      for await (const _ of provider.chat([{ role: 'user', content: 'hi' }], {
        model: 'gemini-pro',
      })) {
        // consume
      }
    }).rejects.toThrow('Google API error 400');
  });

  it('streams text from SSE response', async () => {
    const sseData = [
      'data: {"candidates":[{"content":{"parts":[{"text":"Hello"}]}}]}\n',
      'data: {"candidates":[{"content":{"parts":[{"text":" world"}]},"finishReason":"STOP"}]}\n',
      'data: [DONE]\n',
    ].join('\n');

    const encoder = new TextEncoder();
    const encoded = encoder.encode(sseData);
    let readCount = 0;

    vi.mocked(secureFetch).mockResolvedValue({
      ok: true,
      body: {
        getReader: () => ({
          read: async () => {
            if (readCount === 0) {
              readCount++;
              return { value: encoded, done: false };
            }
            return { value: undefined, done: true };
          },
          releaseLock: vi.fn(),
        }),
      },
    } as never);

    const provider = new GoogleProvider('key');
    const chunks: Array<{ text: string; done: boolean }> = [];
    for await (const chunk of provider.chat([{ role: 'user', content: 'hi' }], {
      model: 'gemini-pro',
    })) {
      chunks.push(chunk);
    }

    expect(chunks.some((c) => c.text === 'Hello')).toBe(true);
    expect(chunks[chunks.length - 1]?.done).toBe(true);
  });

  it('handles null body response', async () => {
    vi.mocked(secureFetch).mockResolvedValue({
      ok: true,
      body: null,
    } as never);

    const provider = new GoogleProvider('key');
    const chunks: Array<{ text: string; done: boolean }> = [];
    for await (const chunk of provider.chat([{ role: 'user', content: 'hi' }], {
      model: 'gemini-pro',
    })) {
      chunks.push(chunk);
    }

    expect(chunks[chunks.length - 1]?.done).toBe(true);
  });

  it('filters system messages from contents', async () => {
    vi.mocked(secureFetch).mockResolvedValue({
      ok: true,
      body: null,
    } as never);

    const provider = new GoogleProvider('key');
    for await (const _ of provider.chat(
      [
        { role: 'system', content: 'system msg' },
        { role: 'user', content: 'hi' },
      ],
      { model: 'gemini-pro' },
    )) {
      // consume
    }

    const callArgs = vi.mocked(secureFetch).mock.calls[0];
    const body = JSON.parse(callArgs?.[1]?.body as string);
    expect(body.contents).toHaveLength(1);
    expect(body.contents[0].role).toBe('user');
    expect(body.systemInstruction).toBeDefined();
    expect(body.systemInstruction.parts[0].text).toBe('system msg');
  });

  it('uses fallback system prompt from options', async () => {
    vi.mocked(secureFetch).mockResolvedValue({
      ok: true,
      body: null,
    } as never);

    const provider = new GoogleProvider('key');
    for await (const _ of provider.chat([{ role: 'user', content: 'hi' }], {
      model: 'gemini-pro',
      systemPrompt: 'fallback prompt',
    })) {
      // consume
    }

    const callArgs = vi.mocked(secureFetch).mock.calls[0];
    const body = JSON.parse(callArgs?.[1]?.body as string);
    expect(body.systemInstruction.parts[0].text).toBe('fallback prompt');
  });

  it('maps assistant role to model', async () => {
    vi.mocked(secureFetch).mockResolvedValue({
      ok: true,
      body: null,
    } as never);

    const provider = new GoogleProvider('key');
    for await (const _ of provider.chat(
      [
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: 'hello' },
        { role: 'user', content: 'how are you' },
      ],
      { model: 'gemini-pro' },
    )) {
      // consume
    }

    const callArgs = vi.mocked(secureFetch).mock.calls[0];
    const body = JSON.parse(callArgs?.[1]?.body as string);
    expect(body.contents[1].role).toBe('model');
  });
});
