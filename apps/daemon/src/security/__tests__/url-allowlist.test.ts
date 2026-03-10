import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { BlockedDomainError, OUTBOUND_ALLOWLIST, secureFetch } from '../url-allowlist.js';

describe('secureFetch', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('allows requests to allowlisted hostname', async () => {
    const response = await secureFetch('https://api.anthropic.com/v1/messages');
    expect(response.status).toBe(200);
    expect(globalThis.fetch).toHaveBeenCalledOnce();
  });

  it('throws BlockedDomainError for blocked hostname', async () => {
    await expect(secureFetch('https://evil.example.com/steal')).rejects.toThrow(BlockedDomainError);
  });

  it('throws on malformed URL', async () => {
    await expect(secureFetch('not-a-url')).rejects.toThrow();
  });

  it('allows localhost', async () => {
    const response = await secureFetch('http://localhost:11434/api/generate');
    expect(response.status).toBe(200);
  });

  it('passes request options through to fetch', async () => {
    await secureFetch('https://api.openai.com/v1/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.openai.com/v1/chat',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('sets a timeout signal on the request', async () => {
    await secureFetch('https://api.telegram.org/bot/getMe');

    const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(callArgs[1].signal).toBeDefined();
  });
});

describe('OUTBOUND_ALLOWLIST', () => {
  it('contains api.anthropic.com', () => {
    expect(OUTBOUND_ALLOWLIST.has('api.anthropic.com')).toBe(true);
  });

  it('contains api.openai.com', () => {
    expect(OUTBOUND_ALLOWLIST.has('api.openai.com')).toBe(true);
  });

  it('contains api.telegram.org', () => {
    expect(OUTBOUND_ALLOWLIST.has('api.telegram.org')).toBe(true);
  });

  it('contains localhost', () => {
    expect(OUTBOUND_ALLOWLIST.has('localhost')).toBe(true);
  });

  it('contains slack.com', () => {
    expect(OUTBOUND_ALLOWLIST.has('slack.com')).toBe(true);
  });

  it('contains discord.com', () => {
    expect(OUTBOUND_ALLOWLIST.has('discord.com')).toBe(true);
  });
});

describe('BlockedDomainError', () => {
  it('has correct name', () => {
    const error = new BlockedDomainError('evil.com');
    expect(error.name).toBe('BlockedDomainError');
  });

  it('includes hostname in message', () => {
    const error = new BlockedDomainError('evil.com');
    expect(error.message).toContain('evil.com');
    expect(error.message).toContain('not in the allowlist');
  });
});
