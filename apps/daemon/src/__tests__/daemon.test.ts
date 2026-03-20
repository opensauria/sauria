import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockStartDaemonContext = vi.fn();
const mockStopDaemonContext = vi.fn();

vi.mock('../daemon-lifecycle.js', () => ({
  startDaemonContext: (...args: unknown[]) => mockStartDaemonContext(...args),
  stopDaemonContext: (...args: unknown[]) => mockStopDaemonContext(...args),
}));

vi.mock('../utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
  }),
}));

describe('startDaemon', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  it('does not write ready status (emitted inside startDaemonContext)', async () => {
    mockStartDaemonContext.mockResolvedValue({ db: {} });

    const { startDaemon } = await import('../daemon.js');
    await startDaemon();

    // Ready signal is emitted inside startDaemonContext before MCP captures
    // stdout. daemon.ts must NOT write it again (stdout may be captured).
    const stdoutCalls = stdoutSpy.mock.calls.map((c: [unknown, ...unknown[]]) => c[0] as string);
    expect(stdoutCalls.some((s: string) => s.includes('"ready"'))).toBe(false);
  });

  it('writes error status to both stdout and stderr on failure', async () => {
    mockStartDaemonContext.mockRejectedValue(new Error('init failed'));

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });

    const { startDaemon } = await import('../daemon.js');
    await expect(startDaemon()).rejects.toThrow('process.exit');

    // Error written to stdout (for Tauri — stdout is still clean at this point)
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('"status":"error"'));
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('init failed'));

    // Error also written to stderr as reliable fallback
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('"status":"error"'));
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('init failed'));

    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });
});

describe('additional coverage — startDaemon', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  it('handles non-Error exceptions on failure', async () => {
    mockStartDaemonContext.mockRejectedValue('string error');

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });

    const { startDaemon } = await import('../daemon.js');
    await expect(startDaemon()).rejects.toThrow('process.exit');

    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('string error'));
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('string error'));

    exitSpy.mockRestore();
  });

  it('sets activeContext on success without writing to stdout', async () => {
    mockStartDaemonContext.mockResolvedValue({ db: {} });

    const { startDaemon } = await import('../daemon.js');
    await startDaemon();

    // No stdout writes from daemon.ts on success
    expect(stdoutSpy).not.toHaveBeenCalled();
  });

  it('writes valid JSON error status to both streams', async () => {
    mockStartDaemonContext.mockRejectedValue(new Error('crash'));

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });

    const { startDaemon } = await import('../daemon.js');
    await expect(startDaemon()).rejects.toThrow('process.exit');

    // Verify stdout has valid JSON
    const stdoutWritten = stdoutSpy.mock.calls[0]?.[0] as string;
    const stdoutParsed = JSON.parse(stdoutWritten.trim()) as Record<string, unknown>;
    expect(stdoutParsed.status).toBe('error');
    expect(stdoutParsed.message).toBe('crash');

    // Verify stderr has identical valid JSON
    const stderrWritten = stderrSpy.mock.calls[0]?.[0] as string;
    const stderrParsed = JSON.parse(stderrWritten.trim()) as Record<string, unknown>;
    expect(stderrParsed.status).toBe('error');
    expect(stderrParsed.message).toBe('crash');

    exitSpy.mockRestore();
  });
});
