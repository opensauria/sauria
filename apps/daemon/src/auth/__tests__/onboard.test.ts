import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  spinner: vi.fn().mockReturnValue({ start: vi.fn(), stop: vi.fn() }),
  note: vi.fn(),
  outro: vi.fn(),
}));

vi.mock('../../db/connection.js', () => ({
  openDatabase: vi.fn().mockReturnValue({}),
  closeDatabase: vi.fn(),
}));

vi.mock('../../db/schema.js', () => ({
  applySchema: vi.fn(),
}));

vi.mock('../../config/loader.js', () => ({
  loadConfig: vi.fn().mockResolvedValue({
    auth: {},
    models: { reasoning: {}, extraction: {}, embedding: {} },
  }),
  saveConfig: vi.fn(),
  ensureConfigDir: vi.fn(),
}));

vi.mock('@sauria/config', () => ({
  paths: { db: '/mock/.sauria/world.db' },
}));

vi.mock('../model-presets.js', () => ({
  getModelPreset: vi.fn().mockReturnValue({
    reasoning: { provider: 'anthropic', model: 'claude-sonnet-4-20250514' },
    extraction: { provider: 'anthropic', model: 'claude-haiku' },
    embedding: { provider: 'none', model: 'none' },
  }),
  formatPresetSummary: vi.fn().mockReturnValue('Models: anthropic/claude-sonnet-4-20250514'),
}));

vi.mock('../../setup/detect-clients.js', () => ({
  detectMcpClients: vi.fn().mockReturnValue([]),
}));

vi.mock('../../setup/register-mcp.js', () => ({
  registerMcpInAllClients: vi.fn().mockReturnValue([]),
}));

vi.mock('../../setup/daemon-service.js', () => ({
  generateDaemonService: vi.fn().mockReturnValue(null),
}));

vi.mock('../onboard-providers.js', () => ({
  chooseConnectionMode: vi.fn(),
  setupClaudeSubscription: vi.fn(),
  setupApiKey: vi.fn(),
  setupLocal: vi.fn(),
}));

import { runOnboarding } from '../onboard.js';
import * as p from '@clack/prompts';
import { saveConfig } from '../../config/loader.js';
import {
  chooseConnectionMode,
  setupClaudeSubscription,
  setupApiKey,
  setupLocal,
} from '../onboard-providers.js';
import { detectMcpClients } from '../../setup/detect-clients.js';
import { registerMcpInAllClients } from '../../setup/register-mcp.js';
import { generateDaemonService } from '../../setup/daemon-service.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('runOnboarding', () => {
  it('runs claude_subscription flow', async () => {
    vi.mocked(chooseConnectionMode).mockResolvedValue('claude_subscription');
    vi.mocked(setupClaudeSubscription).mockResolvedValue({
      provider: 'anthropic',
      authMethod: 'oauth',
      credential: 'token-123',
    });

    await runOnboarding();

    expect(p.intro).toHaveBeenCalledWith('Welcome to Sauria');
    expect(setupClaudeSubscription).toHaveBeenCalled();
    expect(saveConfig).toHaveBeenCalled();
    expect(p.note).toHaveBeenCalled();
  });

  it('runs api_key flow', async () => {
    vi.mocked(chooseConnectionMode).mockResolvedValue('api_key');
    vi.mocked(setupApiKey).mockResolvedValue({
      provider: 'openai',
      authMethod: 'encrypted_file',
      credential: 'sk-test',
    });

    await runOnboarding();

    expect(setupApiKey).toHaveBeenCalled();
    expect(saveConfig).toHaveBeenCalled();
  });

  it('runs local flow', async () => {
    vi.mocked(chooseConnectionMode).mockResolvedValue('local');
    vi.mocked(setupLocal).mockResolvedValue({
      provider: 'ollama',
      authMethod: 'none',
      credential: '',
    });

    await runOnboarding();

    expect(setupLocal).toHaveBeenCalled();
    expect(saveConfig).toHaveBeenCalled();
  });

  it('saves config with provider auth method', async () => {
    vi.mocked(chooseConnectionMode).mockResolvedValue('api_key');
    vi.mocked(setupApiKey).mockResolvedValue({
      provider: 'google',
      authMethod: 'encrypted_file',
      credential: 'key-123',
    });

    await runOnboarding();

    const savedConfig = vi.mocked(saveConfig).mock.calls[0]?.[0] as Record<string, unknown>;
    const auth = savedConfig['auth'] as Record<string, unknown>;
    expect(auth['google']).toEqual({ method: 'encrypted_file' });
  });

  it('shows detected AI clients in post-setup', async () => {
    vi.mocked(chooseConnectionMode).mockResolvedValue('local');
    vi.mocked(setupLocal).mockResolvedValue({
      provider: 'ollama',
      authMethod: 'none',
      credential: '',
    });
    vi.mocked(detectMcpClients).mockReturnValue([
      { name: 'Claude Desktop', detected: true, configPath: '/mock/path' },
    ] as never);
    vi.mocked(registerMcpInAllClients).mockReturnValue([
      { client: 'Claude Desktop', status: 'registered' },
    ] as never);

    await runOnboarding();

    expect(p.outro).toHaveBeenCalledWith(expect.stringContaining('Restart'));
  });

  it('shows manual start message when no clients detected', async () => {
    vi.mocked(chooseConnectionMode).mockResolvedValue('local');
    vi.mocked(setupLocal).mockResolvedValue({
      provider: 'ollama',
      authMethod: 'none',
      credential: '',
    });
    vi.mocked(detectMcpClients).mockReturnValue([]);

    await runOnboarding();

    expect(p.outro).toHaveBeenCalledWith(expect.stringContaining('sauria daemon'));
  });

  it('shows daemon platform when service is generated', async () => {
    vi.mocked(chooseConnectionMode).mockResolvedValue('local');
    vi.mocked(setupLocal).mockResolvedValue({
      provider: 'ollama',
      authMethod: 'none',
      credential: '',
    });
    vi.mocked(generateDaemonService).mockReturnValue({ platform: 'launchd' } as never);

    await runOnboarding();

    const spinnerInstance = vi.mocked(p.spinner).mock.results[1]?.value as {
      stop: ReturnType<typeof vi.fn>;
    };
    expect(spinnerInstance.stop).toHaveBeenCalledWith(expect.stringContaining('launchd'));
  });
});
