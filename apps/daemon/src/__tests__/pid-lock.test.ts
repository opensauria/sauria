import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

vi.mock('../config/paths.js', () => ({
  paths: {
    pidFile: '/mock-home/.sauria/daemon.pid',
  },
}));

import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { acquirePidLock, releasePidLock } from '../pid-lock.js';

describe('acquirePidLock', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes current pid when no existing pid file', () => {
    vi.mocked(existsSync).mockReturnValue(false);

    acquirePidLock();

    expect(writeFileSync).toHaveBeenCalledWith(
      '/mock-home/.sauria/daemon.pid',
      String(process.pid),
      'utf-8',
    );
  });

  it('overwrites stale pid file when process does not exist', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('99999');

    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => {
      const error = new Error('No such process') as NodeJS.ErrnoException;
      error.code = 'ESRCH';
      throw error;
    });

    acquirePidLock();

    expect(writeFileSync).toHaveBeenCalledWith(
      '/mock-home/.sauria/daemon.pid',
      String(process.pid),
      'utf-8',
    );

    killSpy.mockRestore();
  });

  it('throws when another daemon is running', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('12345');

    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);

    expect(() => acquirePidLock()).toThrow('Another daemon is already running');

    killSpy.mockRestore();
  });

  it('handles invalid pid in file gracefully', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('not-a-number');

    acquirePidLock();

    expect(writeFileSync).toHaveBeenCalled();
  });

  it('re-throws non-ESRCH errors from process.kill', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('12345');

    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => {
      const error = new Error('Permission denied') as NodeJS.ErrnoException;
      error.code = 'EPERM';
      throw error;
    });

    expect(() => acquirePidLock()).toThrow('Permission denied');

    killSpy.mockRestore();
  });
});

describe('releasePidLock', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('removes pid file when it matches current process', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(String(process.pid));

    releasePidLock();

    expect(unlinkSync).toHaveBeenCalledWith('/mock-home/.sauria/daemon.pid');
  });

  it('does not remove pid file when it belongs to another process', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('99999');

    releasePidLock();

    expect(unlinkSync).not.toHaveBeenCalled();
  });

  it('does nothing when pid file does not exist', () => {
    vi.mocked(existsSync).mockReturnValue(false);

    releasePidLock();

    expect(unlinkSync).not.toHaveBeenCalled();
  });

  it('swallows errors silently', () => {
    vi.mocked(existsSync).mockImplementation(() => {
      throw new Error('FS error');
    });

    expect(() => releasePidLock()).not.toThrow();
  });
});
