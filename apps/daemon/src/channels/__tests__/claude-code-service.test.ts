import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Hoist mock fns so vi.mock factory can reference them
const { mockExecFile, mockRealpathSync, mockStatSync } = vi.hoisted(() => ({
  mockExecFile: vi.fn(),
  mockRealpathSync: vi.fn(),
  mockStatSync: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  execFile: mockExecFile,
}));

vi.mock('node:fs', () => ({
  realpathSync: (...args: unknown[]) => mockRealpathSync(...args),
  statSync: (...args: unknown[]) => mockStatSync(...args),
}));

vi.mock('../../utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { validateProjectPath, ClaudeCodeService } from '../claude-code-service.js';

// ─── Helpers ──────────────────────────────────────────────────────

function setupValidPath(resolved = '/Users/teo/project'): void {
  mockRealpathSync.mockReturnValue(resolved);
  mockStatSync.mockReturnValue({ isDirectory: () => true });
}

function simulateExecFile(stdout: string, error: Error | null = null): void {
  mockExecFile.mockImplementation(
    (
      _cmd: string,
      _args: string[],
      _opts: Record<string, unknown>,
      cb: (err: Error | null, stdout: string, stderr: string) => void,
    ) => {
      const child = { kill: vi.fn() };
      if (error) {
        cb(error, '', error.message);
      } else {
        cb(null, stdout, '');
      }
      return child;
    },
  );
}

// ─── validateProjectPath ──────────────────────────────────────────

describe('validateProjectPath', () => {
  beforeEach(() => {
    vi.stubEnv('HOME', '/Users/teo');
    mockRealpathSync.mockReset();
    mockStatSync.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('rejects non-absolute path', () => {
    expect(() => validateProjectPath('relative/path')).toThrow('must be absolute');
  });

  it('rejects non-existent path', () => {
    mockRealpathSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    expect(() => validateProjectPath('/no/such/path')).toThrow('does not exist');
  });

  it('rejects /etc/ prefix', () => {
    mockRealpathSync.mockReturnValue('/etc/passwd');
    expect(() => validateProjectPath('/etc/passwd')).toThrow('restricted directory');
  });

  it('rejects /var/ prefix', () => {
    mockRealpathSync.mockReturnValue('/var/log');
    expect(() => validateProjectPath('/var/log')).toThrow('restricted directory');
  });

  it('rejects /System/ prefix', () => {
    mockRealpathSync.mockReturnValue('/System/Library');
    expect(() => validateProjectPath('/System/Library')).toThrow('restricted directory');
  });

  it('rejects /usr/ prefix', () => {
    mockRealpathSync.mockReturnValue('/usr/bin');
    expect(() => validateProjectPath('/usr/bin')).toThrow('restricted directory');
  });

  it('rejects ~/.sauria/ path', () => {
    mockRealpathSync.mockReturnValue('/Users/teo/.sauria/data');
    expect(() => validateProjectPath('/Users/teo/.sauria/data')).toThrow('restricted directory');
  });

  it('rejects non-directory', () => {
    mockRealpathSync.mockReturnValue('/Users/teo/file.txt');
    mockStatSync.mockReturnValue({ isDirectory: () => false });
    expect(() => validateProjectPath('/Users/teo/file.txt')).toThrow('not a directory');
  });

  it('accepts valid project path', () => {
    setupValidPath('/Users/teo/project');
    const result = validateProjectPath('/Users/teo/project');
    expect(result).toBe('/Users/teo/project');
  });
});

// ─── ClaudeCodeService ────────────────────────────────────────────

describe('ClaudeCodeService', () => {
  beforeEach(() => {
    vi.stubEnv('HOME', '/Users/teo');
    mockRealpathSync.mockReset();
    mockStatSync.mockReset();
    mockExecFile.mockReset();
    setupValidPath();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function createService() {
    return new ClaudeCodeService({
      projectPath: '/Users/teo/project',
      permissionMode: 'default',
    });
  }

  it('sendMessage calls execFile with correct args', async () => {
    const streamOutput = JSON.stringify({ type: 'result', content: 'Done' });
    simulateExecFile(streamOutput);

    const service = createService();
    await service.sendMessage('fix the bug');

    expect(mockExecFile).toHaveBeenCalledOnce();
    const [cmd, args, opts] = mockExecFile.mock.calls[0] as [
      string,
      string[],
      Record<string, unknown>,
    ];
    expect(cmd).toBe('claude');
    expect(args).toContain('--print');
    expect(args).toContain('--output-format');
    expect(args).toContain('stream-json');
    expect(args).toContain('--permission-mode');
    expect(args).toContain('default');
    expect(args).toContain('-p');
    expect(args).toContain('fix the bug');
    expect(opts.cwd).toBe('/Users/teo/project');
  });

  it('parses session_id and uses --resume on next call', async () => {
    const firstOutput = [
      JSON.stringify({ type: 'system', session_id: 'sess-abc123' }),
      JSON.stringify({ type: 'result', content: 'First response' }),
    ].join('\n');
    simulateExecFile(firstOutput);

    const service = createService();
    await service.sendMessage('hello');

    // Second call
    const secondOutput = JSON.stringify({ type: 'result', content: 'Second response' });
    simulateExecFile(secondOutput);
    await service.sendMessage('follow up');

    const [, args] = mockExecFile.mock.calls[1] as [string, string[]];
    expect(args).toContain('--resume');
    expect(args).toContain('sess-abc123');
  });

  it('accumulates assistant/text and result content', async () => {
    const output = [
      JSON.stringify({ type: 'assistant', subtype: 'text', content: 'Hello ' }),
      JSON.stringify({ type: 'assistant', subtype: 'text', content: 'world' }),
      JSON.stringify({ type: 'result', content: '!' }),
    ].join('\n');
    simulateExecFile(output);

    const service = createService();
    const result = await service.sendMessage('test');
    expect(result).toBe('Hello world!');
  });

  it('returns fallback when no text events', async () => {
    const output = JSON.stringify({ type: 'system', session_id: 'x' });
    simulateExecFile(output);

    const service = createService();
    const result = await service.sendMessage('test');
    expect(result).toBe('(no response from Claude Code)');
  });

  it('throws when busy with concurrent message', async () => {
    // Store callback to resolve later via mutable wrapper
    const holder: { resolve: ((stdout: string) => void) | null } = { resolve: null };
    mockExecFile.mockImplementation(
      (
        _cmd: string,
        _args: string[],
        _opts: Record<string, unknown>,
        cb: (err: Error | null, stdout: string, stderr: string) => void,
      ) => {
        holder.resolve = (stdout: string) => cb(null, stdout, '');
        return { kill: vi.fn() };
      },
    );

    const service = createService();
    const pending = service.sendMessage('first');

    await expect(service.sendMessage('second')).rejects.toThrow('busy');

    // Clean up: resolve the pending promise
    holder.resolve?.(JSON.stringify({ type: 'result', content: 'done' }));
    await pending;
  });

  it('setPermissionMode changes mode for next call', async () => {
    const output = JSON.stringify({ type: 'result', content: 'ok' });
    simulateExecFile(output);

    const service = createService();
    service.setPermissionMode('plan');
    await service.sendMessage('test');

    const [, args] = mockExecFile.mock.calls[0] as [string, string[]];
    expect(args).toContain('plan');
  });

  it('resetSession clears sessionId', async () => {
    const output = [
      JSON.stringify({ type: 'system', session_id: 'sess-xyz' }),
      JSON.stringify({ type: 'result', content: 'ok' }),
    ].join('\n');
    simulateExecFile(output);

    const service = createService();
    await service.sendMessage('first');
    await service.resetSession();

    // Next call should not have --resume
    const secondOutput = JSON.stringify({ type: 'result', content: 'fresh' });
    simulateExecFile(secondOutput);
    await service.sendMessage('second');

    const [, args] = mockExecFile.mock.calls[1] as [string, string[]];
    expect(args).not.toContain('--resume');
  });

  it('stop kills process and clears busy flag', async () => {
    const killFn = vi.fn();
    mockExecFile.mockImplementation(() => ({ kill: killFn }));

    const service = createService();
    service.sendMessage('test').catch(() => {});
    // Let the async exec() resolve the api key and assign this.process
    await new Promise((r) => setTimeout(r, 0));
    service.stop();

    expect(killFn).toHaveBeenCalledWith('SIGTERM');
    expect(service.isBusy).toBe(false);
  });
});
