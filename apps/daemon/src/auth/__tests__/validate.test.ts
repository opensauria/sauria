import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../security/url-allowlist.js', () => ({
  secureFetch: vi.fn(),
}));

vi.mock('../resolve.js', () => ({
  isOAuthToken: vi.fn((v: string) => v.startsWith('sk-ant-oat01-')),
}));

import { validateCredential } from '../validate.js';
import { secureFetch } from '../../security/url-allowlist.js';

const mockSecureFetch = vi.mocked(secureFetch);

function mockFetchOk(): void {
  mockSecureFetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    text: () => Promise.resolve(''),
  } as Response);
}

function mockFetchError(status: number, body = ''): void {
  mockSecureFetch.mockResolvedValueOnce({
    ok: false,
    status,
    text: () => Promise.resolve(body),
  } as unknown as Response);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('validateCredential — anthropic', () => {
  it('validates successfully with API key using x-api-key header', async () => {
    mockFetchOk();

    const result = await validateCredential('anthropic', 'sk-ant-api-key-123');
    expect(result.isValid).toBe(true);
    expect(result.accountInfo).toBe('Anthropic API access confirmed');

    const [, init] = mockSecureFetch.mock.calls[0]!;
    const headers = init?.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('sk-ant-api-key-123');
    expect(headers['authorization']).toBeUndefined();
  });

  it('validates successfully with OAuth token using Bearer header', async () => {
    mockFetchOk();

    const result = await validateCredential('anthropic', 'sk-ant-oat01-oauth-token');
    expect(result.isValid).toBe(true);

    const [, init] = mockSecureFetch.mock.calls[0]!;
    const headers = init?.headers as Record<string, string>;
    expect(headers['authorization']).toBe('Bearer sk-ant-oat01-oauth-token');
    expect(headers['x-api-key']).toBeUndefined();
  });

  it('returns invalid on non-ok response', async () => {
    mockFetchError(401, 'Unauthorized');

    const result = await validateCredential('anthropic', 'bad-key');
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('Anthropic');
    expect(result.error).toContain('401');
  });
});

describe('validateCredential — openai and compatible providers', () => {
  it('validates openai with bearer token', async () => {
    mockFetchOk();

    const result = await validateCredential('openai', 'sk-openai-key');
    expect(result.isValid).toBe(true);
    expect(result.accountInfo).toBe('OpenAI API access confirmed');

    const [, init] = mockSecureFetch.mock.calls[0]!;
    const headers = init?.headers as Record<string, string>;
    expect(headers['authorization']).toBe('Bearer sk-openai-key');
  });

  it.each(['openrouter', 'together', 'groq', 'mistral'])(
    'validates %s using openai-compatible endpoint',
    async (provider) => {
      mockFetchOk();
      const result = await validateCredential(provider, 'some-key');
      expect(result.isValid).toBe(true);
      expect(result.accountInfo).toBe('OpenAI API access confirmed');
    },
  );

  it('returns invalid for openai on error response', async () => {
    mockFetchError(403);

    const result = await validateCredential('openai', 'bad-key');
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('OpenAI');
    expect(result.error).toContain('403');
  });
});

describe('validateCredential — google', () => {
  it('validates with query param', async () => {
    mockFetchOk();

    const result = await validateCredential('google', 'google-api-key');
    expect(result.isValid).toBe(true);
    expect(result.accountInfo).toBe('Google AI access confirmed');

    const [url] = mockSecureFetch.mock.calls[0]!;
    expect(url).toContain('key=google-api-key');
  });

  it('returns invalid on error response', async () => {
    mockFetchError(400);

    const result = await validateCredential('google', 'bad-key');
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('Google');
  });
});

describe('validateCredential — local providers', () => {
  it('ollama always returns valid without network call', async () => {
    const result = await validateCredential('ollama', '');
    expect(result.isValid).toBe(true);
    expect(result.accountInfo).toContain('Local provider');
    expect(mockSecureFetch).not.toHaveBeenCalled();
  });

  it('local always returns valid without network call', async () => {
    const result = await validateCredential('local', '');
    expect(result.isValid).toBe(true);
    expect(mockSecureFetch).not.toHaveBeenCalled();
  });
});

describe('validateCredential — unknown provider', () => {
  it('returns invalid for unknown provider', async () => {
    const result = await validateCredential('some-unknown', 'key');
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('Unknown provider');
    expect(result.error).toContain('some-unknown');
  });
});

describe('validateCredential — network errors', () => {
  it('propagates fetch errors', async () => {
    mockSecureFetch.mockRejectedValueOnce(new Error('Network timeout'));

    await expect(validateCredential('anthropic', 'key')).rejects.toThrow('Network timeout');
  });
});
