import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCreate = vi.fn();

vi.mock('openai', () => ({
  default: class MockOpenAI {
    chat = { completions: { create: mockCreate } };
    constructor(_opts: Record<string, unknown>) {}
  },
}));

import { OpenAIProvider } from '../providers/openai.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('OpenAIProvider', () => {
  it('sets name to openai by default', () => {
    const provider = new OpenAIProvider('key');
    expect(provider.name).toBe('openai');
    expect(provider.supportsStreaming).toBe(true);
  });

  it('sets name to openai-compatible with baseUrl', () => {
    const provider = new OpenAIProvider('key', 'https://custom.api');
    expect(provider.name).toBe('openai-compatible');
  });

  it('streams text chunks', async () => {
    const streamData = [
      { choices: [{ delta: { content: 'Hi' }, finish_reason: null }] },
      { choices: [{ delta: { content: ' there' }, finish_reason: 'stop' }] },
    ];

    mockCreate.mockResolvedValue({
      [Symbol.asyncIterator]: () => {
        let i = 0;
        return {
          next: async () => {
            if (i >= streamData.length) return { value: undefined, done: true };
            return { value: streamData[i++], done: false };
          },
        };
      },
    });

    const provider = new OpenAIProvider('key');
    const chunks: Array<{ text: string; done: boolean }> = [];
    for await (const chunk of provider.chat(
      [{ role: 'user', content: 'hello' }],
      { model: 'gpt-4' },
    )) {
      chunks.push(chunk);
    }

    expect(chunks.some((c) => c.text === 'Hi')).toBe(true);
    expect(chunks[chunks.length - 1]?.done).toBe(true);
  });

  it('skips chunks with no choices', async () => {
    const streamData = [
      { choices: [] as unknown[] },
      { choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }] },
    ];

    mockCreate.mockResolvedValue({
      [Symbol.asyncIterator]: () => {
        let i = 0;
        return {
          next: async () => {
            if (i >= streamData.length) return { value: undefined, done: true };
            return { value: streamData[i++], done: false };
          },
        };
      },
    });

    const provider = new OpenAIProvider('key');
    const chunks: Array<{ text: string; done: boolean }> = [];
    for await (const chunk of provider.chat(
      [{ role: 'user', content: 'hi' }],
      { model: 'gpt-4' },
    )) {
      chunks.push(chunk);
    }

    const textChunks = chunks.filter((c) => c.text !== '');
    expect(textChunks).toHaveLength(1);
    expect(textChunks[0]?.text).toBe('ok');
  });

  it('handles chunks with null content', async () => {
    const streamData = [
      { choices: [{ delta: { content: null }, finish_reason: null }] },
      { choices: [{ delta: { content: 'done' }, finish_reason: 'stop' }] },
    ];

    mockCreate.mockResolvedValue({
      [Symbol.asyncIterator]: () => {
        let i = 0;
        return {
          next: async () => {
            if (i >= streamData.length) return { value: undefined, done: true };
            return { value: streamData[i++], done: false };
          },
        };
      },
    });

    const provider = new OpenAIProvider('key');
    const chunks: Array<{ text: string; done: boolean }> = [];
    for await (const chunk of provider.chat(
      [{ role: 'user', content: 'hi' }],
      { model: 'gpt-4' },
    )) {
      chunks.push(chunk);
    }

    expect(chunks.filter((c) => c.text === 'done')).toHaveLength(1);
  });

  it('prepends system prompt from options', async () => {
    mockCreate.mockResolvedValue({
      [Symbol.asyncIterator]: () => ({
        next: async () => ({ value: undefined, done: true }),
      }),
    });

    const provider = new OpenAIProvider('key');
    for await (const _ of provider.chat(
      [{ role: 'user', content: 'hi' }],
      { model: 'gpt-4', systemPrompt: 'be helpful' },
    )) {
      // consume
    }

    const callArgs = mockCreate.mock.calls[0]?.[0];
    expect(callArgs.messages[0]).toEqual({ role: 'system', content: 'be helpful' });
  });

  it('yields done at end of stream without finish_reason', async () => {
    const streamData = [
      { choices: [{ delta: { content: 'text' }, finish_reason: null }] },
    ];

    mockCreate.mockResolvedValue({
      [Symbol.asyncIterator]: () => {
        let i = 0;
        return {
          next: async () => {
            if (i >= streamData.length) return { value: undefined, done: true };
            return { value: streamData[i++], done: false };
          },
        };
      },
    });

    const provider = new OpenAIProvider('key');
    const chunks: Array<{ text: string; done: boolean }> = [];
    for await (const chunk of provider.chat(
      [{ role: 'user', content: 'hi' }],
      { model: 'gpt-4' },
    )) {
      chunks.push(chunk);
    }

    expect(chunks[chunks.length - 1]?.done).toBe(true);
  });
});
