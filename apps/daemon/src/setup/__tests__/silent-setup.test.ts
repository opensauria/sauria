import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../db/connection.js', () => ({
  openDatabase: vi.fn(() => ({ close: vi.fn() })),
  closeDatabase: vi.fn(),
}));

vi.mock('../../db/schema.js', () => ({
  applySchema: vi.fn(),
}));

vi.mock('../../config/loader.js', () => ({
  loadConfig: vi.fn(),
  saveConfig: vi.fn(),
  ensureConfigDir: vi.fn(),
}));

vi.mock('../../security/vault-key.js', () => ({
  vaultStore: vi.fn(),
}));

vi.mock('../../auth/validate.js', () => ({
  validateCredential: vi.fn(),
}));

vi.mock('../../auth/model-presets.js', () => ({
  getModelPreset: vi.fn(() => ({ primary: 'claude-sonnet-4-20250514', fallback: 'claude-haiku-4-20250514' })),
}));

vi.mock('../detect-clients.js', () => ({
  detectMcpClients: vi.fn(() => []),
}));

vi.mock('../register-mcp.js', () => ({
  registerMcpInAllClients: vi.fn(() => []),
}));

vi.mock('../daemon-service.js', () => ({
  generateDaemonService: vi.fn(() => null),
}));

import { loadConfig, saveConfig, ensureConfigDir } from '../../config/loader.js';
import { vaultStore } from '../../security/vault-key.js';
import { validateCredential } from '../../auth/validate.js';
import { detectMcpClients } from '../detect-clients.js';
import { registerMcpInAllClients } from '../register-mcp.js';
import { generateDaemonService } from '../daemon-service.js';
import { runSilentSetup } from '../silent-setup.js';

describe('runSilentSetup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadConfig).mockResolvedValue({
      auth: {},
      models: { primary: '', fallback: '' },
      owner: { telegram: undefined, slack: undefined, whatsapp: undefined },
      channels: {
        telegram: { allowedUserIds: [], voice: { enabled: false, model: 'auto', maxDurationSeconds: 120 } },
        discord: { guildId: '', botUserId: '' },
        whatsapp: { phoneNumberId: '', webhookPort: 9090 },
        email: { imapHost: '', imapPort: 993, smtpHost: '', smtpPort: 587, username: '', tls: true },
      },
    } as never);
    vi.mocked(saveConfig).mockResolvedValue(undefined);
    vi.mocked(ensureConfigDir).mockResolvedValue(undefined);
    vi.mocked(vaultStore).mockResolvedValue(undefined);
  });

  it('validates credentials when validate is true and provider is not ollama', async () => {
    vi.mocked(validateCredential).mockResolvedValue({ isValid: true, accountInfo: 'test-account' });

    const result = await runSilentSetup({
      provider: 'anthropic',
      apiKey: 'sk-test',
      validate: true,
    });

    expect(validateCredential).toHaveBeenCalledWith('anthropic', 'sk-test');
    expect(result.success).toBe(true);
  });

  it('returns failure when credential validation fails', async () => {
    vi.mocked(validateCredential).mockResolvedValue({ isValid: false, error: 'Invalid key' });

    const result = await runSilentSetup({
      provider: 'anthropic',
      apiKey: 'bad-key',
      validate: true,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid key');
  });

  it('skips validation for ollama', async () => {
    const result = await runSilentSetup({
      provider: 'ollama',
      apiKey: '',
      validate: true,
    });

    expect(validateCredential).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
  });

  it('skips validation when validate is false', async () => {
    const result = await runSilentSetup({
      provider: 'anthropic',
      apiKey: 'sk-test',
      validate: false,
    });

    expect(validateCredential).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
  });

  it('stores api key in vault for non-ollama providers', async () => {
    const result = await runSilentSetup({
      provider: 'openai',
      apiKey: 'sk-openai',
      validate: false,
    });

    expect(vaultStore).toHaveBeenCalledWith('openai-api-key', 'sk-openai');
    expect(result.success).toBe(true);
  });

  it('skips vault store for ollama', async () => {
    await runSilentSetup({
      provider: 'ollama',
      apiKey: '',
      validate: false,
    });

    expect(vaultStore).not.toHaveBeenCalled();
  });

  it('includes registered mcp clients in result', async () => {
    vi.mocked(detectMcpClients).mockReturnValue([
      { name: 'Claude Desktop', configPath: '/path/config.json', detected: true },
    ]);
    vi.mocked(registerMcpInAllClients).mockReturnValue([
      { client: 'Claude Desktop', status: 'registered' },
    ]);

    const result = await runSilentSetup({
      provider: 'anthropic',
      apiKey: 'sk-test',
      validate: false,
    });

    expect(result.mcpClients).toContain('Claude Desktop');
  });

  it('includes daemon command when service is generated', async () => {
    vi.mocked(generateDaemonService).mockReturnValue({
      platform: 'macOS',
      servicePath: '/path/plist',
      activationCommand: 'launchctl load ...',
    });

    const result = await runSilentSetup({
      provider: 'anthropic',
      apiKey: 'sk-test',
      validate: false,
    });

    expect(result.daemonCommand).toBe('launchctl load ...');
  });

  it('returns undefined daemonCommand when no service generated', async () => {
    vi.mocked(generateDaemonService).mockReturnValue(null);

    const result = await runSilentSetup({
      provider: 'anthropic',
      apiKey: 'sk-test',
      validate: false,
    });

    expect(result.daemonCommand).toBeUndefined();
  });
});
