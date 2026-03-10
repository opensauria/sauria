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
  let writeSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    writeSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
  });

  afterEach(() => {
    writeSpy.mockRestore();
  });

  it('writes ready status on successful start', async () => {
    const mockContext = { db: {} };
    mockStartDaemonContext.mockResolvedValue(mockContext);

    const { startDaemon } = await import('../daemon.js');
    await startDaemon();

    expect(writeSpy).toHaveBeenCalledWith('{"status":"ready"}\n');
  });

  it('writes error status and exits on failure', async () => {
    mockStartDaemonContext.mockRejectedValue(new Error('init failed'));

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });

    const { startDaemon } = await import('../daemon.js');

    await expect(startDaemon()).rejects.toThrow('process.exit');

    expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining('"status":"error"'));
    expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining('init failed'));
    expect(exitSpy).toHaveBeenCalledWith(1);

    exitSpy.mockRestore();
  });
});

describe('additional coverage — startDaemon', () => {
  let writeSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    writeSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
  });

  afterEach(() => {
    writeSpy.mockRestore();
  });

  it('handles non-Error exceptions on failure', async () => {
    mockStartDaemonContext.mockRejectedValue('string error');

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });

    const { startDaemon } = await import('../daemon.js');
    await expect(startDaemon()).rejects.toThrow('process.exit');

    expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining('string error'));

    exitSpy.mockRestore();
  });

  it('writes valid JSON status on success', async () => {
    mockStartDaemonContext.mockResolvedValue({ db: {} });

    const { startDaemon } = await import('../daemon.js');
    await startDaemon();

    const written = writeSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(written.trim()) as Record<string, unknown>;
    expect(parsed.status).toBe('ready');
  });

  it('writes valid JSON status on error', async () => {
    mockStartDaemonContext.mockRejectedValue(new Error('crash'));

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });

    const { startDaemon } = await import('../daemon.js');
    await expect(startDaemon()).rejects.toThrow('process.exit');

    const written = writeSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(written.trim()) as Record<string, unknown>;
    expect(parsed.status).toBe('error');
    expect(parsed.message).toBe('crash');

    exitSpy.mockRestore();
  });
});
