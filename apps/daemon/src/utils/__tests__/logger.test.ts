import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs', () => ({
  appendFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn(() => []),
  unlinkSync: vi.fn(),
}));
vi.mock('../../security/pii-scrubber.js', () => ({
  scrubPII: vi.fn((text: string) => text),
}));
vi.mock('../../security/fs-sandbox.js', () => ({
  safePath: vi.fn((p: string) => p),
}));
vi.mock('../../config/paths.js', () => ({
  paths: { logs: '/mock/logs' },
}));

import { appendFileSync, readdirSync, unlinkSync } from 'node:fs';
import { Logger, getLogger } from '../logger.js';

describe('Logger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redacts API key patterns in log messages', () => {
    const logger = new Logger('debug');
    logger.info('token sk_test12345678');
    const call = vi.mocked(appendFileSync).mock.calls[0];
    expect(call).toBeDefined();
    const written = call![1] as string;
    expect(written).toContain('[KEY_REDACTED]');
    expect(written).not.toContain('sk_test12345678');
  });

  it('passes clean text through without modification', () => {
    const logger = new Logger('debug');
    logger.info('hello world');
    const call = vi.mocked(appendFileSync).mock.calls[0];
    const written = call![1] as string;
    expect(written).toContain('hello world');
  });

  it('filters messages below minimum level', () => {
    const logger = new Logger('warn');
    logger.debug('should be filtered');
    logger.info('also filtered');
    expect(appendFileSync).not.toHaveBeenCalled();
  });

  it('writes formatted log entry to file', () => {
    const logger = new Logger('info');
    logger.info('test message');
    expect(appendFileSync).toHaveBeenCalledOnce();
    const written = vi.mocked(appendFileSync).mock.calls[0]![1] as string;
    expect(written).toContain('[INFO]');
    expect(written).toContain('test message');
  });

  it('includes context in log output', () => {
    const logger = new Logger('info');
    logger.info('with context', { key: 'value' });
    const written = vi.mocked(appendFileSync).mock.calls[0]![1] as string;
    expect(written).toContain('"key"');
    expect(written).toContain('"value"');
  });

  it('falls back to stderr when file write fails', () => {
    vi.mocked(appendFileSync).mockImplementation(() => {
      throw new Error('disk full');
    });
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const logger = new Logger('info');
    logger.error('critical error');
    expect(stderrSpy).toHaveBeenCalled();
    const written = stderrSpy.mock.calls[0]![0] as string;
    expect(written).toContain('Failed to write log');
    stderrSpy.mockRestore();
  });

  it('setLevel changes the filtering threshold', () => {
    const logger = new Logger('error');
    logger.info('filtered');
    expect(appendFileSync).not.toHaveBeenCalled();
    logger.setLevel('debug');
    logger.info('now visible');
    expect(appendFileSync).toHaveBeenCalledOnce();
  });

  it('supports all log levels', () => {
    const logger = new Logger('debug');
    logger.debug('d');
    logger.info('i');
    logger.warn('w');
    logger.error('e');
    logger.fatal('f');
    expect(appendFileSync).toHaveBeenCalledTimes(5);
  });
});

describe('pruneOldLogs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('silently returns when readdirSync fails', () => {
    vi.mocked(readdirSync).mockImplementation(() => {
      throw new Error('dir not found');
    });
    const logger = new Logger('info');
    logger.info('trigger prune');
    expect(unlinkSync).not.toHaveBeenCalled();
  });

  it('deletes log files older than retention cutoff', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-10T12:00:00.000Z'));

    vi.mocked(readdirSync).mockReturnValue([
      'sauria-2026-01-01.log',
      'sauria-2026-03-09.log',
      'other-file.txt',
    ] as unknown as ReturnType<typeof readdirSync>);

    const logger = new Logger('info');
    logger.info('trigger prune');

    expect(unlinkSync).toHaveBeenCalledWith('/mock/logs/sauria-2026-01-01.log');
    const unlinkCalls = vi.mocked(unlinkSync).mock.calls.map((c) => c[0]);
    expect(unlinkCalls).not.toContain('/mock/logs/sauria-2026-03-09.log');

    vi.useRealTimers();
  });

  it('ignores unlinkSync failures', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-10T12:00:00.000Z'));

    vi.mocked(readdirSync).mockReturnValue(['sauria-2026-01-01.log'] as unknown as ReturnType<
      typeof readdirSync
    >);
    vi.mocked(unlinkSync).mockImplementation(() => {
      throw new Error('permission denied');
    });

    const logger = new Logger('info');
    expect(() => logger.info('trigger')).not.toThrow();

    vi.useRealTimers();
  });
});

describe('pruneIfNeeded', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('only prunes once per day', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-10T12:00:00.000Z'));

    vi.mocked(readdirSync).mockReturnValue([] as unknown as ReturnType<typeof readdirSync>);

    const logger = new Logger('info');
    logger.info('first log');
    logger.info('second log');
    logger.info('third log');

    expect(readdirSync).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });
});

describe('getLogger', () => {
  it('returns a Logger instance', () => {
    const logger = getLogger();
    expect(logger).toBeInstanceOf(Logger);
  });

  it('returns the same singleton instance', () => {
    const a = getLogger();
    const b = getLogger();
    expect(a).toBe(b);
  });
});
