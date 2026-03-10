import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  existsSync: vi.fn(),
}));

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { registerMcpInClient, registerMcpInAllClients } from '../register-mcp.js';
import type { McpClient } from '../detect-clients.js';

describe('registerMcpInClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('skips undetected clients', () => {
    const client: McpClient = {
      name: 'Claude Desktop',
      configPath: '/path/config.json',
      detected: false,
    };

    const result = registerMcpInClient(client);

    expect(result.status).toBe('skipped');
    expect(result.client).toBe('Claude Desktop');
    expect(writeFileSync).not.toHaveBeenCalled();
  });

  it('returns already_registered when sauria entry exists', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({ mcpServers: { sauria: { command: 'sauria', args: ['mcp-server'] } } }),
    );

    const client: McpClient = {
      name: 'Claude Desktop',
      configPath: '/path/config.json',
      detected: true,
    };

    const result = registerMcpInClient(client);

    expect(result.status).toBe('already_registered');
    expect(writeFileSync).not.toHaveBeenCalled();
  });

  it('registers sauria entry in empty config', () => {
    vi.mocked(existsSync).mockImplementation((p) => {
      if (typeof p === 'string' && p.endsWith('config.json')) return false;
      return true;
    });

    const client: McpClient = {
      name: 'Cursor',
      configPath: '/path/config.json',
      detected: true,
    };

    const result = registerMcpInClient(client);

    expect(result.status).toBe('registered');
    expect(writeFileSync).toHaveBeenCalled();
    const writtenContent = JSON.parse(vi.mocked(writeFileSync).mock.calls[0]?.[1] as string);
    expect(writtenContent.mcpServers.sauria).toBeDefined();
    expect(writtenContent.mcpServers.sauria.command).toBe('sauria');
  });

  it('preserves existing mcp servers when registering', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({ mcpServers: { other: { command: 'other', args: [] } } }),
    );

    const client: McpClient = {
      name: 'Claude Desktop',
      configPath: '/path/config.json',
      detected: true,
    };

    const result = registerMcpInClient(client);

    expect(result.status).toBe('registered');
    const writtenContent = JSON.parse(vi.mocked(writeFileSync).mock.calls[0]?.[1] as string);
    expect(writtenContent.mcpServers.other).toBeDefined();
    expect(writtenContent.mcpServers.sauria).toBeDefined();
  });

  it('handles malformed JSON gracefully', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('not valid json{');

    const client: McpClient = {
      name: 'Cursor',
      configPath: '/path/config.json',
      detected: true,
    };

    const result = registerMcpInClient(client);

    expect(result.status).toBe('registered');
  });

  it('creates directory if it does not exist', () => {
    vi.mocked(existsSync).mockReturnValue(false);

    const client: McpClient = {
      name: 'Windsurf',
      configPath: '/path/to/config.json',
      detected: true,
    };

    registerMcpInClient(client);

    expect(mkdirSync).toHaveBeenCalled();
  });
});

describe('registerMcpInAllClients', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('processes all clients and returns results', () => {
    vi.mocked(existsSync).mockReturnValue(false);

    const clients: McpClient[] = [
      { name: 'Claude Desktop', configPath: '/a', detected: false },
      { name: 'Cursor', configPath: '/b', detected: true },
    ];

    const results = registerMcpInAllClients(clients);

    expect(results).toHaveLength(2);
    expect(results[0]?.status).toBe('skipped');
    expect(results[1]?.status).toBe('registered');
  });
});
