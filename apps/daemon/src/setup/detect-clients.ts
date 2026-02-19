import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir, platform } from 'node:os';

export interface McpClient {
  readonly name: string;
  readonly configPath: string;
  readonly detected: boolean;
}

function home(): string {
  return homedir();
}

function appData(): string {
  return process.env['APPDATA'] ?? join(home(), 'AppData', 'Roaming');
}

function claudeDesktopConfigPath(): string {
  switch (platform()) {
    case 'darwin':
      return join(home(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
    case 'win32':
      return join(appData(), 'Claude', 'claude_desktop_config.json');
    default:
      return join(home(), '.config', 'Claude', 'claude_desktop_config.json');
  }
}

function claudeDesktopDetected(configPath: string): boolean {
  if (existsSync(configPath) || existsSync(dirname(configPath))) return true;
  if (platform() === 'darwin') return existsSync('/Applications/Claude.app');
  return false;
}

function cursorConfigPath(): string {
  if (platform() === 'win32') {
    return join(appData(), 'Cursor', 'User', 'globalStorage', 'mcp.json');
  }
  return join(home(), '.cursor', 'mcp.json');
}

function cursorDetected(configPath: string): boolean {
  if (existsSync(configPath) || existsSync(dirname(configPath))) return true;
  if (platform() === 'darwin') return existsSync('/Applications/Cursor.app');
  return false;
}

function windsurfConfigPath(): string {
  if (platform() === 'win32') {
    return join(appData(), 'Windsurf', 'User', 'globalStorage', 'mcp.json');
  }
  return join(home(), '.codeium', 'windsurf', 'mcp_config.json');
}

function windsurfDetected(configPath: string): boolean {
  if (existsSync(configPath) || existsSync(dirname(configPath))) return true;
  if (platform() === 'darwin') return existsSync('/Applications/Windsurf.app');
  return false;
}

export function detectMcpClients(): McpClient[] {
  const claudePath = claudeDesktopConfigPath();
  const cursorPath = cursorConfigPath();
  const windsurfPath = windsurfConfigPath();

  return [
    {
      name: 'Claude Desktop',
      configPath: claudePath,
      detected: claudeDesktopDetected(claudePath),
    },
    {
      name: 'Cursor',
      configPath: cursorPath,
      detected: cursorDetected(cursorPath),
    },
    {
      name: 'Windsurf',
      configPath: windsurfPath,
      detected: windsurfDetected(windsurfPath),
    },
  ];
}
