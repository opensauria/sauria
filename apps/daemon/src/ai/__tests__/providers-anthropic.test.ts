import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockStream = vi.fn();

vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = { stream: mockStream };
    constructor(_opts: Record<string, unknown>) {}
  },
}));

import { AnthropicProvider } from '../providers/anthropic.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AnthropicProvider', () => {
  it('sets name and supportsStreaming', () => {
    const provider = new AnthropicProvider('sk-test-key');
    expect(provider.name).toBe('anthropic');
    expect(provider.supportsStreaming).toBe(true);
  });

  it('handles OAuth token prefix without throwing', () => {
    expect(() => new AnthropicProvider('sk-ant-oat01-test-token')).not.toThrow();
  });

  it('handles regular API key without throwing', () => {
    expect(() => new AnthropicProvider('sk-ant-api03-regular')).not.toThrow();
  });

  it('streams text chunks', async () => {
    const events = [
      { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello' } },
      { type: 'content_block_delta', delta: { type: 'text_delta', text: ' world' } },
      { type: 'message_stop' },
    ];

    mockStream.mockReturnValue({
      [Symbol.asyncIterator]: () => {
        let i = 0;
        return {
          next: async () => {
            if (i >= events.length) return { value: undefined, done: true };
            return { value: events[i++], done: false };
          },
        };
      },
    });

    const provider = new AnthropicProvider('sk-test-key');
    const chunks: Array<{ text: string; done: boolean }> = [];
    for await (const chunk of provider.chat([{ role: 'user', content: 'hi' }], {
      model: 'claude-3-5-sonnet-20241022',
    })) {
      chunks.push(chunk);
    }

    expect(chunks.some((c) => c.text === 'Hello')).toBe(true);
    expect(chunks.some((c) => c.text === ' world')).toBe(true);
    expect(chunks[chunks.length - 1]?.done).toBe(true);
  });

  it('skips non text_delta events', async () => {
    const events = [
      { type: 'content_block_delta', delta: { type: 'input_json_delta', partial_json: '{}' } },
      { type: 'content_block_delta', delta: { type: 'text_delta', text: 'ok' } },
    ];

    mockStream.mockReturnValue({
      [Symbol.asyncIterator]: () => {
        let i = 0;
        return {
          next: async () => {
            if (i >= events.length) return { value: undefined, done: true };
            return { value: events[i++], done: false };
          },
        };
      },
    });

    const provider = new AnthropicProvider('sk-test-key');
    const chunks: Array<{ text: string; done: boolean }> = [];
    for await (const chunk of provider.chat([{ role: 'user', content: 'hi' }], {
      model: 'claude-3-5-sonnet-20241022',
    })) {
      chunks.push(chunk);
    }

    const textChunks = chunks.filter((c) => !c.done);
    expect(textChunks).toHaveLength(1);
    expect(textChunks[0]?.text).toBe('ok');
  });

  it('skips non content_block_delta events', async () => {
    const events = [
      { type: 'message_start', message: {} },
      { type: 'content_block_delta', delta: { type: 'text_delta', text: 'hi' } },
    ];

    mockStream.mockReturnValue({
      [Symbol.asyncIterator]: () => {
        let i = 0;
        return {
          next: async () => {
            if (i >= events.length) return { value: undefined, done: true };
            return { value: events[i++], done: false };
          },
        };
      },
    });

    const provider = new AnthropicProvider('sk-test-key');
    const chunks: Array<{ text: string; done: boolean }> = [];
    for await (const chunk of provider.chat([{ role: 'user', content: 'hi' }], {
      model: 'claude-3-5-sonnet-20241022',
    })) {
      chunks.push(chunk);
    }

    const textChunks = chunks.filter((c) => !c.done);
    expect(textChunks).toHaveLength(1);
    expect(textChunks[0]?.text).toBe('hi');
  });

  it('extracts system message from messages array', async () => {
    mockStream.mockReturnValue({
      [Symbol.asyncIterator]: () => ({
        next: async () => ({ value: undefined, done: true }),
      }),
    });

    const provider = new AnthropicProvider('sk-test-key');
    const chunks: Array<{ text: string; done: boolean }> = [];
    for await (const chunk of provider.chat(
      [
        { role: 'system', content: 'be helpful' },
        { role: 'user', content: 'hi' },
      ],
      { model: 'claude-3-5-sonnet-20241022' },
    )) {
      chunks.push(chunk);
    }

    const callArgs = mockStream.mock.calls[0]?.[0];
    expect(callArgs.system).toBe('be helpful');
    expect(callArgs.messages).toEqual([{ role: 'user', content: 'hi' }]);
  });

  it('uses options.systemPrompt as fallback', async () => {
    mockStream.mockReturnValue({
      [Symbol.asyncIterator]: () => ({
        next: async () => ({ value: undefined, done: true }),
      }),
    });

    const provider = new AnthropicProvider('sk-test-key');
    for await (const _ of provider.chat([{ role: 'user', content: 'hi' }], {
      model: 'claude-3-5-sonnet-20241022',
      systemPrompt: 'fallback',
    })) {
      // consume
    }

    const callArgs = mockStream.mock.calls[0]?.[0];
    expect(callArgs.system).toBe('fallback');
  });
});
