import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs', () => ({
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  existsSync: vi.fn(),
}));

vi.mock('node:os', () => ({
  homedir: () => '/mock-home',
  platform: vi.fn(() => 'darwin'),
}));

vi.mock('../../config/paths.js', () => ({
  paths: {
    home: '/mock-home/.sauria',
    logs: '/mock-home/.sauria/logs',
  },
}));

import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { platform } from 'node:os';
import { generateDaemonService } from '../daemon-service.js';

describe('generateDaemonService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(existsSync).mockReturnValue(false);
  });

  it('generates launchd plist on macOS', () => {
    vi.mocked(platform).mockReturnValue('darwin');

    const result = generateDaemonService();

    expect(result).not.toBeNull();
    expect(result?.platform).toBe('macOS');
    expect(result?.servicePath).toContain('ai.sauria.daemon.plist');
    expect(result?.activationCommand).toContain('launchctl load');
    expect(writeFileSync).toHaveBeenCalled();
    expect(mkdirSync).toHaveBeenCalledWith(
      expect.stringContaining('LaunchAgents'),
      { recursive: true },
    );
  });

  it('skips mkdir on macOS when LaunchAgents exists', () => {
    vi.mocked(platform).mockReturnValue('darwin');
    vi.mocked(existsSync).mockReturnValue(true);

    generateDaemonService();

    expect(mkdirSync).not.toHaveBeenCalled();
  });

  it('generates systemd unit on Linux', () => {
    vi.mocked(platform).mockReturnValue('linux');

    const result = generateDaemonService();

    expect(result).not.toBeNull();
    expect(result?.platform).toBe('Linux');
    expect(result?.servicePath).toContain('sauria.service');
    expect(result?.activationCommand).toContain('systemctl');
    expect(writeFileSync).toHaveBeenCalled();
  });

  it('generates task xml on Windows', () => {
    vi.mocked(platform).mockReturnValue('win32');

    const result = generateDaemonService();

    expect(result).not.toBeNull();
    expect(result?.platform).toBe('Windows');
    expect(result?.servicePath).toContain('sauria-task.xml');
    expect(result?.activationCommand).toContain('schtasks');
    expect(writeFileSync).toHaveBeenCalled();
  });

  it('returns null on unsupported platform', () => {
    vi.mocked(platform).mockReturnValue('freebsd');

    const result = generateDaemonService();

    expect(result).toBeNull();
  });

  it('plist content contains the daemon label', () => {
    vi.mocked(platform).mockReturnValue('darwin');

    generateDaemonService();

    const writtenContent = vi.mocked(writeFileSync).mock.calls[0]?.[1] as string;
    expect(writtenContent).toContain('ai.sauria.daemon');
    expect(writtenContent).toContain('<key>RunAtLoad</key>');
  });

  it('systemd unit contains restart config', () => {
    vi.mocked(platform).mockReturnValue('linux');

    generateDaemonService();

    const writtenContent = vi.mocked(writeFileSync).mock.calls[0]?.[1] as string;
    expect(writtenContent).toContain('Restart=on-failure');
    expect(writtenContent).toContain('RestartSec=30');
  });
});
