import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import type { AppContext } from '../cli-actions.js';

vi.mock('../db/connection.js', () => ({
  openDatabase: vi.fn(),
  closeDatabase: vi.fn(),
}));

vi.mock('../db/schema.js', () => ({
  applySchema: vi.fn(),
}));

vi.mock('../config/loader.js', () => ({
  loadConfig: vi.fn().mockResolvedValue({ models: { reasoning: { provider: 'anthropic', model: 'claude' } } }),
}));

vi.mock('../ai/router.js', () => ({
  ModelRouter: vi.fn(),
}));

vi.mock('../security/audit.js', () => ({
  AuditLogger: vi.fn(),
}));

vi.mock('../auth/resolve.js', () => ({
  resolveApiKey: vi.fn(),
}));

vi.mock('../security/startup-checks.js', () => ({
  runSecurityChecks: vi.fn(),
}));

vi.mock('../mcp/server.js', () => ({
  startMcpServer: vi.fn(),
}));

vi.mock('../cli-actions.js', () => ({
  askAction: vi.fn(),
  focusAction: vi.fn(),
  entityAction: vi.fn(),
  upcomingAction: vi.fn(),
  insightsAction: vi.fn(),
  teachAction: vi.fn(),
  sourcesAction: vi.fn(),
  auditAction: vi.fn(),
  exportAction: vi.fn(),
  purgeAction: vi.fn(),
}));

vi.mock('../channels/cli-interactive.js', () => ({
  startInteractiveMode: vi.fn(),
}));

vi.mock('../channels/connect-telegram.js', () => ({
  connectTelegram: vi.fn(),
}));

import { registerCommands } from '../cli-commands.js';

type ContextRunner = (fn: (ctx: AppContext) => Promise<void> | void) => () => Promise<void>;

function createMockWithContext(): ContextRunner {
  return (fn) => {
    return async () => {
      const ctx = {} as AppContext;
      await fn(ctx);
    };
  };
}

describe('registerCommands', () => {
  let program: Command;
  let withContext: ContextRunner;

  beforeEach(() => {
    vi.clearAllMocks();
    program = new Command();
    program.exitOverride();
    withContext = createMockWithContext();
    registerCommands(program, withContext);
  });

  it('registers ask command', () => {
    const cmd = program.commands.find((c) => c.name() === 'ask');
    expect(cmd).toBeDefined();
    expect(cmd?.description()).toBe('Ask a natural language question');
  });

  it('registers interactive command', () => {
    const cmd = program.commands.find((c) => c.name() === 'interactive');
    expect(cmd).toBeDefined();
  });

  it('registers focus command', () => {
    const cmd = program.commands.find((c) => c.name() === 'focus');
    expect(cmd).toBeDefined();
    expect(cmd?.description()).toContain('Deep dive');
  });

  it('registers entity command', () => {
    const cmd = program.commands.find((c) => c.name() === 'entity');
    expect(cmd).toBeDefined();
  });

  it('registers upcoming command with optional hours argument', () => {
    const cmd = program.commands.find((c) => c.name() === 'upcoming');
    expect(cmd).toBeDefined();
    expect(cmd?.description()).toContain('deadlines');
  });

  it('registers insights command', () => {
    const cmd = program.commands.find((c) => c.name() === 'insights');
    expect(cmd).toBeDefined();
  });

  it('registers teach command', () => {
    const cmd = program.commands.find((c) => c.name() === 'teach');
    expect(cmd).toBeDefined();
  });

  it('registers sources command', () => {
    const cmd = program.commands.find((c) => c.name() === 'sources');
    expect(cmd).toBeDefined();
  });

  it('registers audit command with optional count', () => {
    const cmd = program.commands.find((c) => c.name() === 'audit');
    expect(cmd).toBeDefined();
  });

  it('registers export command', () => {
    const cmd = program.commands.find((c) => c.name() === 'export');
    expect(cmd).toBeDefined();
  });

  it('registers import command', () => {
    const cmd = program.commands.find((c) => c.name() === 'import');
    expect(cmd).toBeDefined();
    expect(cmd?.description()).toBe('Import data');
  });

  it('registers purge command', () => {
    const cmd = program.commands.find((c) => c.name() === 'purge');
    expect(cmd).toBeDefined();
  });

  it('registers mcp-server command', () => {
    const cmd = program.commands.find((c) => c.name() === 'mcp-server');
    expect(cmd).toBeDefined();
    expect(cmd?.description()).toContain('MCP server');
  });

  it('registers doctor command', () => {
    const cmd = program.commands.find((c) => c.name() === 'doctor');
    expect(cmd).toBeDefined();
    expect(cmd?.description()).toContain('health');
  });

  it('registers connect command', () => {
    const cmd = program.commands.find((c) => c.name() === 'connect');
    expect(cmd).toBeDefined();
  });

  it('registers config command', () => {
    const cmd = program.commands.find((c) => c.name() === 'config');
    expect(cmd).toBeDefined();
  });
});
