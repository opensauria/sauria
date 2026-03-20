import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { Writable, Readable } from 'node:stream';
import { ClaudeCliService } from '../providers/claude-cli.js';

vi.mock('../../utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

const mockSpawn = vi.fn();
vi.mock('node:child_process', () => ({
  spawn: (...args: unknown[]) => mockSpawn(...args),
}));

function createMockChild(stdout: string, exitCode = 0) {
  const child = new EventEmitter() as EventEmitter & {
    stdin: Writable;
    stdout: Readable;
    stderr: Readable;
  };

  const stdinChunks: string[] = [];
  child.stdin = new Writable({
    write(chunk, _enc, cb) {
      stdinChunks.push(chunk.toString());
      cb();
    },
  });

  child.stdout = new Readable({ read() {} });
  child.stderr = new Readable({ read() {} });

  child.stdin.on('finish', () => {
    process.nextTick(() => {
      child.stdout.push(stdout);
      child.stdout.push(null);
      child.stderr.push(null);
      child.emit('close', exitCode);
    });
  });

  return { child, stdinChunks };
}

describe('ClaudeCliService', () => {
  let service: ClaudeCliService;

  beforeEach(() => {
    vi.clearAllMocks();
    (ClaudeCliService as unknown as { available: boolean | null }).available = null;
    service = new ClaudeCliService();
  });

  afterEach(() => {
    (ClaudeCliService as unknown as { available: boolean | null }).available = null;
  });

  describe('isAvailable', () => {
    it('returns true when claude binary exists', async () => {
      mockSpawn.mockImplementation(() => {
        const child = new EventEmitter();
        process.nextTick(() => child.emit('close', 0));
        return child;
      });

      const result = await ClaudeCliService.isAvailable();

      expect(result).toBe(true);
      expect(mockSpawn).toHaveBeenCalledWith(
        'claude',
        ['--version'],
        expect.objectContaining({ timeout: 5_000 }),
      );
    });

    it('returns false when claude binary is missing', async () => {
      mockSpawn.mockImplementation(() => {
        const child = new EventEmitter();
        process.nextTick(() => child.emit('error', new Error('ENOENT')));
        return child;
      });

      const result = await ClaudeCliService.isAvailable();

      expect(result).toBe(false);
    });

    it('caches the result after first check', async () => {
      mockSpawn.mockImplementation(() => {
        const child = new EventEmitter();
        process.nextTick(() => child.emit('close', 0));
        return child;
      });

      await ClaudeCliService.isAvailable();
      await ClaudeCliService.isAvailable();

      expect(mockSpawn).toHaveBeenCalledTimes(1);
    });
  });

  describe('session management', () => {
    it('stores and retrieves session IDs', () => {
      service.setSession('node-1', 'session-abc');
      expect(service.getSession('node-1')).toBe('session-abc');
    });

    it('returns null for unknown nodes', () => {
      expect(service.getSession('unknown')).toBeNull();
    });

    it('resets session for a node', () => {
      service.setSession('node-1', 'session-abc');
      service.resetSession('node-1');
      expect(service.getSession('node-1')).toBeNull();
    });
  });

  describe('query', () => {
    it('pipes prompt via stdin and parses JSON result', async () => {
      const jsonResult = JSON.stringify({
        type: 'result',
        result: 'Hello',
        session_id: 'sess-123',
      });

      const { child, stdinChunks } = createMockChild(jsonResult);
      mockSpawn.mockReturnValue(child);

      const result = await service.query('node-1', 'sonnet', 'test prompt');

      expect(result.text).toBe('Hello');
      expect(result.sessionId).toBe('sess-123');
      expect(stdinChunks.join('')).toBe('test prompt');
      expect(mockSpawn).toHaveBeenCalledWith(
        'claude',
        ['--print', '--output-format', 'json', '--model', 'sonnet'],
        expect.objectContaining({ timeout: 120_000, stdio: ['pipe', 'pipe', 'pipe'] }),
      );
    });

    it('passes --resume when session exists', async () => {
      service.setSession('node-1', 'existing-session');

      const jsonResult = JSON.stringify({ type: 'result', result: 'Resumed' });
      const { child } = createMockChild(jsonResult);
      mockSpawn.mockReturnValue(child);

      await service.query('node-1', 'opus', 'follow up');

      expect(mockSpawn).toHaveBeenCalledWith(
        'claude',
        ['--print', '--output-format', 'json', '--model', 'opus', '--resume', 'existing-session'],
        expect.anything(),
      );
    });

    it('updates session ID from response', async () => {
      const jsonResult = JSON.stringify({ type: 'result', result: 'Hi', session_id: 'new-sess' });
      const { child } = createMockChild(jsonResult);
      mockSpawn.mockReturnValue(child);

      await service.query('node-1', 'haiku', 'test');

      expect(service.getSession('node-1')).toBe('new-sess');
    });

    it('rejects on non-zero exit code', async () => {
      const { child } = createMockChild('', 1);
      mockSpawn.mockReturnValue(child);

      await expect(service.query('node-1', 'sonnet', 'test')).rejects.toThrow(
        'Claude CLI exited with code 1',
      );
    });

    it('rejects on spawn error', async () => {
      const child = new EventEmitter() as EventEmitter & {
        stdin: Writable;
        stdout: Readable;
        stderr: Readable;
      };
      child.stdin = new Writable({ write(_c, _e, cb) { cb(); } });
      child.stdout = new Readable({ read() {} });
      child.stderr = new Readable({ read() {} });
      child.stdin.on('finish', () => {
        process.nextTick(() => child.emit('error', new Error('ENOENT')));
      });

      mockSpawn.mockReturnValue(child);

      await expect(service.query('node-1', 'sonnet', 'test')).rejects.toThrow(
        'Claude CLI failed: ENOENT',
      );
    });

    it('returns fallback text when no result in response', async () => {
      const jsonResult = JSON.stringify({ type: 'result' });
      const { child } = createMockChild(jsonResult);
      mockSpawn.mockReturnValue(child);

      const result = await service.query('node-1', 'sonnet', 'test');

      expect(result.text).toBe('(no response from Claude CLI)');
    });

    it('handles non-JSON output as plain text fallback', async () => {
      const { child } = createMockChild('some plain text response');
      mockSpawn.mockReturnValue(child);

      const result = await service.query('node-1', 'sonnet', 'test');

      expect(result.text).toBe('some plain text response');
    });

    it('strips CLAUDE_CODE_* env vars from subprocess', async () => {
      process.env.CLAUDECODE = 'true';
      process.env.CLAUDE_CODE_SSE_PORT = '3000';

      const jsonResult = JSON.stringify({ type: 'result', result: 'Hi' });
      const { child } = createMockChild(jsonResult);
      mockSpawn.mockReturnValue(child);

      await service.query('node-1', 'sonnet', 'test');

      const callEnv = mockSpawn.mock.calls[0]![2].env as Record<string, string>;
      expect(callEnv.CLAUDECODE).toBeUndefined();
      expect(callEnv.CLAUDE_CODE_SSE_PORT).toBeUndefined();

      delete process.env.CLAUDECODE;
      delete process.env.CLAUDE_CODE_SSE_PORT;
    });

    it('uses tmpdir as cwd', async () => {
      const jsonResult = JSON.stringify({ type: 'result', result: 'Hi' });
      const { child } = createMockChild(jsonResult);
      mockSpawn.mockReturnValue(child);

      await service.query('node-1', 'sonnet', 'test');

      const callCwd = mockSpawn.mock.calls[0]![2].cwd as string;
      expect(callCwd).toBeTruthy();
      expect(callCwd).not.toContain('.sauria');
    });

    it('handles large multiline prompts via stdin', async () => {
      const largePrompt = 'System prompt\n'.repeat(500) + 'User message with "quotes" and special chars: <>&';
      const jsonResult = JSON.stringify({ type: 'result', result: 'OK' });
      const { child, stdinChunks } = createMockChild(jsonResult);
      mockSpawn.mockReturnValue(child);

      const result = await service.query('node-1', 'sonnet', largePrompt);

      expect(result.text).toBe('OK');
      expect(stdinChunks.join('')).toBe(largePrompt);
    });
  });
});
