import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
}));

vi.mock('node:os', () => ({
  homedir: () => '/mock-home',
  platform: vi.fn(() => 'darwin'),
}));

import { existsSync } from 'node:fs';
import { platform } from 'node:os';
import { detectMcpClients } from '../detect-clients.js';

describe('detectMcpClients', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(existsSync).mockReturnValue(false);
  });

  it('returns three known clients', () => {
    const clients = detectMcpClients();

    expect(clients).toHaveLength(3);
    expect(clients.map((c) => c.name)).toEqual(['Claude Desktop', 'Cursor', 'Windsurf']);
  });

  it('detects Claude Desktop via config file existence', () => {
    vi.mocked(platform).mockReturnValue('darwin');
    vi.mocked(existsSync).mockImplementation((p) => {
      if (typeof p === 'string' && p.includes('Claude')) return true;
      return false;
    });

    const clients = detectMcpClients();
    const claude = clients.find((c) => c.name === 'Claude Desktop');

    expect(claude?.detected).toBe(true);
  });

  it('detects Claude Desktop via /Applications/Claude.app on macOS', () => {
    vi.mocked(platform).mockReturnValue('darwin');
    vi.mocked(existsSync).mockImplementation((p) => {
      if (p === '/Applications/Claude.app') return true;
      return false;
    });

    const clients = detectMcpClients();
    const claude = clients.find((c) => c.name === 'Claude Desktop');

    expect(claude?.detected).toBe(true);
  });

  it('marks clients as not detected when no files exist', () => {
    vi.mocked(platform).mockReturnValue('linux');
    vi.mocked(existsSync).mockReturnValue(false);

    const clients = detectMcpClients();

    for (const client of clients) {
      expect(client.detected).toBe(false);
    }
  });

  it('uses Windows paths when platform is win32', () => {
    vi.mocked(platform).mockReturnValue('win32');
    vi.mocked(existsSync).mockReturnValue(false);

    const clients = detectMcpClients();
    const cursor = clients.find((c) => c.name === 'Cursor');

    expect(cursor?.configPath).toContain('Cursor');
  });

  it('detects Cursor via app directory existence', () => {
    vi.mocked(platform).mockReturnValue('darwin');
    vi.mocked(existsSync).mockImplementation((p) => {
      if (typeof p === 'string' && p.includes('.cursor')) return true;
      return false;
    });

    const clients = detectMcpClients();
    const cursor = clients.find((c) => c.name === 'Cursor');

    expect(cursor?.detected).toBe(true);
  });

  it('detects Windsurf via config dir existence', () => {
    vi.mocked(platform).mockReturnValue('darwin');
    vi.mocked(existsSync).mockImplementation((p) => {
      if (typeof p === 'string' && p.includes('codeium')) return true;
      return false;
    });

    const clients = detectMcpClients();
    const windsurf = clients.find((c) => c.name === 'Windsurf');

    expect(windsurf?.detected).toBe(true);
  });
});
