/**
 * MCP client detection and registration (Claude Desktop, Cursor, Windsurf).
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir, platform } from 'node:os';

export interface McpClient {
  readonly name: string;
  readonly configPath: string;
  readonly detected: boolean;
}

export function detectMcpClients(): McpClient[] {
  const home = homedir();
  const os = platform();

  const clients: Array<{ name: string; configPath: string }> = [];

  if (os === 'darwin') {
    clients.push({
      name: 'Claude Desktop',
      configPath: join(
        home,
        'Library',
        'Application Support',
        'Claude',
        'claude_desktop_config.json',
      ),
    });
  } else if (os === 'win32') {
    clients.push({
      name: 'Claude Desktop',
      configPath: join(
        process.env['APPDATA'] ?? join(home, 'AppData', 'Roaming'),
        'Claude',
        'claude_desktop_config.json',
      ),
    });
  } else {
    clients.push({
      name: 'Claude Desktop',
      configPath: join(home, '.config', 'Claude', 'claude_desktop_config.json'),
    });
  }

  clients.push({
    name: 'Cursor',
    configPath:
      os === 'win32'
        ? join(
            process.env['APPDATA'] ?? join(home, 'AppData', 'Roaming'),
            'Cursor',
            'User',
            'globalStorage',
            'mcp.json',
          )
        : join(home, '.cursor', 'mcp.json'),
  });

  clients.push({
    name: 'Windsurf',
    configPath:
      os === 'win32'
        ? join(
            process.env['APPDATA'] ?? join(home, 'AppData', 'Roaming'),
            'Windsurf',
            'User',
            'globalStorage',
            'mcp.json',
          )
        : join(home, '.codeium', 'windsurf', 'mcp_config.json'),
  });

  return clients.map((c) => ({
    ...c,
    detected:
      existsSync(c.configPath) ||
      existsSync(dirname(c.configPath)) ||
      (os === 'darwin' && existsSync(`/Applications/${c.name.replace(' ', '')}.app`)),
  }));
}

export function registerMcpInClient(client: McpClient): string {
  if (!client.detected) return 'skipped';

  let config: Record<string, unknown> = {};
  if (existsSync(client.configPath)) {
    try {
      config = JSON.parse(readFileSync(client.configPath, 'utf-8')) as Record<string, unknown>;
    } catch {
      config = {};
    }
  }

  const servers = (config['mcpServers'] ?? {}) as Record<string, unknown>;
  if (servers['opensauria']) return 'already_registered';

  servers['opensauria'] = { command: 'opensauria', args: ['mcp-server'] };
  config['mcpServers'] = servers;

  const dir = dirname(client.configPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(client.configPath, JSON.stringify(config, null, 2) + '\n');

  return 'registered';
}
