import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs', () => ({
  existsSync: vi.fn().mockReturnValue(true),
}));

vi.mock('../db/connection.js', () => ({
  openDatabase: vi.fn().mockReturnValue({}),
  closeDatabase: vi.fn(),
}));

vi.mock('../db/schema.js', () => ({
  applySchema: vi.fn(),
}));

vi.mock('../config/loader.js', () => ({
  loadConfig: vi.fn().mockResolvedValue({
    mcp: { servers: {} },
    models: { reasoning: { provider: 'anthropic', model: 'claude' } },
  }),
}));

vi.mock('../security/audit.js', () => ({
  AuditLogger: vi.fn().mockImplementation(() => ({
    getTotalCost: vi.fn().mockReturnValue(0),
    getRecentActions: vi.fn().mockReturnValue([]),
    logAction: vi.fn(),
  })),
}));

vi.mock('../ai/router.js', () => ({
  ModelRouter: vi.fn(),
}));

vi.mock('../auth/resolve.js', () => ({
  resolveApiKey: vi.fn(),
}));

vi.mock('../daemon.js', () => ({
  startDaemon: vi.fn(),
}));

vi.mock('../utils/version.js', () => ({
  getVersion: vi.fn().mockReturnValue('1.0.0-test'),
}));

vi.mock('../config/paths.js', () => ({
  paths: { config: '/mock/.sauria/config.json' },
}));

vi.mock('../cli-actions.js', () => ({
  statusAction: vi.fn(),
}));

vi.mock('../cli-commands.js', () => ({
  registerCommands: vi.fn(),
}));

vi.mock('../auth/onboard.js', () => ({
  runOnboarding: vi.fn(),
}));

vi.mock('../setup/silent-setup.js', () => ({
  runSilentSetup: vi.fn(),
}));

import { existsSync } from 'node:fs';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(existsSync).mockReturnValue(true);
});

describe('cli program', () => {
  it('exports a Command instance named sauria', async () => {
    const { program } = await import('../cli.js');
    expect(program.name()).toBe('sauria');
  });

  it('has a version set', async () => {
    const { program } = await import('../cli.js');
    expect(program.version()).toBe('1.0.0-test');
  });

  it('has a description', async () => {
    const { program } = await import('../cli.js');
    expect(program.description()).toBe('Your AI workforce');
  });

  it('registers the onboard command', async () => {
    const { program } = await import('../cli.js');
    const cmd = program.commands.find((c) => c.name() === 'onboard');
    expect(cmd).toBeDefined();
  });

  it('registers the setup command with required provider option', async () => {
    const { program } = await import('../cli.js');
    const cmd = program.commands.find((c) => c.name() === 'setup');
    expect(cmd).toBeDefined();
    const opts = cmd?.options.map((o) => o.long);
    expect(opts).toContain('--provider');
  });

  it('registers the daemon command', async () => {
    const { program } = await import('../cli.js');
    const cmd = program.commands.find((c) => c.name() === 'daemon');
    expect(cmd).toBeDefined();
  });

  it('registers the status command', async () => {
    const { program } = await import('../cli.js');
    const cmd = program.commands.find((c) => c.name() === 'status');
    expect(cmd).toBeDefined();
  });

  it('skips first run check for onboard command', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    const { program } = await import('../cli.js');
    const cmd = program.commands.find((c) => c.name() === 'onboard');
    expect(cmd).toBeDefined();
  });
});
