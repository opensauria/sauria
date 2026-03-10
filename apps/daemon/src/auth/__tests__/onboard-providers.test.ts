import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@clack/prompts', () => ({
  select: vi.fn(),
  text: vi.fn(),
  password: vi.fn(),
  confirm: vi.fn(),
  isCancel: vi.fn().mockReturnValue(false),
  cancel: vi.fn(),
  spinner: vi.fn().mockReturnValue({ start: vi.fn(), stop: vi.fn() }),
  note: vi.fn(),
  log: { info: vi.fn(), warn: vi.fn() },
}));

vi.mock('../../security/vault-key.js', () => ({
  vaultStore: vi.fn(),
}));

vi.mock('../validate.js', () => ({
  validateCredential: vi.fn(),
}));

vi.mock('../oauth.js', () => ({
  generateCodeVerifier: vi.fn().mockReturnValue('verifier-123'),
  generateCodeChallenge: vi.fn().mockReturnValue('challenge-123'),
  buildAuthorizationUrl: vi.fn().mockReturnValue('https://auth.example.com/authorize'),
  exchangeAuthorizationCode: vi.fn(),
  storeOAuthTokens: vi.fn(),
}));

vi.mock('../../setup/detect-local-providers.js', () => ({
  detectLocalProviders: vi.fn(),
}));

import { chooseConnectionMode, setupClaudeSubscription, setupApiKey, setupLocal } from '../onboard-providers.js';
import * as p from '@clack/prompts';
import { vaultStore } from '../../security/vault-key.js';
import { validateCredential } from '../validate.js';
import { exchangeAuthorizationCode, storeOAuthTokens } from '../oauth.js';
import { detectLocalProviders } from '../../setup/detect-local-providers.js';

const mockSelect = vi.mocked(p.select);
const mockText = vi.mocked(p.text);
const mockPassword = vi.mocked(p.password);
const mockConfirm = vi.mocked(p.confirm);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(p.isCancel).mockReturnValue(false);
});

describe('chooseConnectionMode', () => {
  it('returns the selected connection mode', async () => {
    mockSelect.mockResolvedValue('api_key');

    const result = await chooseConnectionMode();
    expect(result).toBe('api_key');
  });

  it('returns claude_subscription mode', async () => {
    mockSelect.mockResolvedValue('claude_subscription');

    const result = await chooseConnectionMode();
    expect(result).toBe('claude_subscription');
  });

  it('returns local mode', async () => {
    mockSelect.mockResolvedValue('local');

    const result = await chooseConnectionMode();
    expect(result).toBe('local');
  });
});

describe('setupClaudeSubscription', () => {
  it('exchanges authorization code and stores tokens', async () => {
    mockText.mockResolvedValue('auth-code-from-user-12345');
    vi.mocked(exchangeAuthorizationCode).mockResolvedValue({
      access_token: 'at-123',
      refresh_token: 'rt-456',
      expires_in: 3600,
    });

    const result = await setupClaudeSubscription();

    expect(result.provider).toBe('anthropic');
    expect(result.authMethod).toBe('oauth');
    expect(result.credential).toBe('at-123');
    expect(storeOAuthTokens).toHaveBeenCalledWith('anthropic', expect.objectContaining({
      access_token: 'at-123',
    }));
  });
});

describe('setupApiKey', () => {
  it('validates and stores a valid API key', async () => {
    mockSelect.mockResolvedValue('anthropic');
    mockPassword.mockResolvedValue('sk-ant-api-test-key');
    vi.mocked(validateCredential).mockResolvedValue({
      isValid: true,
      accountInfo: 'Test Account',
    });

    const result = await setupApiKey();

    expect(result.provider).toBe('anthropic');
    expect(result.authMethod).toBe('encrypted_file');
    expect(result.credential).toBe('sk-ant-api-test-key');
    expect(vaultStore).toHaveBeenCalledWith('anthropic-api-key', 'sk-ant-api-test-key');
  });

  it('prompts to continue when validation fails and user confirms', async () => {
    mockSelect.mockResolvedValue('openai');
    mockPassword.mockResolvedValue('sk-invalid-key');
    vi.mocked(validateCredential).mockResolvedValue({
      isValid: false,
      error: 'Invalid key',
    });
    mockConfirm.mockResolvedValue(true);

    const result = await setupApiKey();

    expect(result.provider).toBe('openai');
    expect(vaultStore).toHaveBeenCalled();
  });
});

describe('setupLocal', () => {
  it('auto-selects single running provider', async () => {
    vi.mocked(detectLocalProviders).mockResolvedValue([
      { name: 'Ollama', baseUrl: 'http://localhost:11434', running: true },
    ]);

    const result = await setupLocal();

    expect(result.provider).toBe('ollama');
    expect(result.authMethod).toBe('none');
    expect(vaultStore).toHaveBeenCalledWith('local-base-url', 'http://localhost:11434');
  });

  it('prompts selection when multiple providers are running', async () => {
    vi.mocked(detectLocalProviders).mockResolvedValue([
      { name: 'Ollama', baseUrl: 'http://localhost:11434', running: true },
      { name: 'LM Studio', baseUrl: 'http://localhost:1234', running: true },
    ]);
    mockSelect.mockResolvedValue('http://localhost:1234');

    const result = await setupLocal();

    expect(result.provider).toBe('lm-studio');
    expect(vaultStore).toHaveBeenCalledWith('local-base-url', 'http://localhost:1234');
  });

  it('prompts manual selection when no providers are running', async () => {
    vi.mocked(detectLocalProviders).mockResolvedValue([
      { name: 'Ollama', baseUrl: 'http://localhost:11434', running: false },
    ]);
    mockSelect.mockResolvedValue('ollama');

    const result = await setupLocal();

    expect(result.provider).toBe('ollama');
    expect(vaultStore).toHaveBeenCalledWith('local-base-url', 'http://localhost:11434');
  });

  it('defaults to ollama URL for unknown manual provider', async () => {
    vi.mocked(detectLocalProviders).mockResolvedValue([]);
    mockSelect.mockResolvedValue('custom-provider');

    const result = await setupLocal();

    expect(vaultStore).toHaveBeenCalledWith('local-base-url', 'http://localhost:11434');
  });
});
