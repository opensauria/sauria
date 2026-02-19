import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import type { McpClient } from './detect-clients.js';

interface McpServerEntry {
  readonly command: string;
  readonly args: readonly string[];
}

interface McpConfig {
  mcpServers?: Record<string, McpServerEntry>;
  [key: string]: unknown;
}

const OPENSAURIA_MCP_ENTRY: McpServerEntry = {
  command: 'opensauria',
  args: ['mcp-server'],
};

function readJsonSafe(filePath: string): McpConfig {
  if (!existsSync(filePath)) return {};
  try {
    const raw = readFileSync(filePath, 'utf-8');
    const parsed: unknown = JSON.parse(raw);
    if (parsed !== null && typeof parsed === 'object') {
      return parsed as McpConfig;
    }
  } catch {
    // Malformed JSON — start fresh but keep backup
  }
  return {};
}

function writeJsonPretty(filePath: string, data: McpConfig): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

export interface RegistrationResult {
  readonly client: string;
  readonly status: 'registered' | 'already_registered' | 'skipped';
}

export function registerMcpInClient(client: McpClient): RegistrationResult {
  if (!client.detected) {
    return { client: client.name, status: 'skipped' };
  }

  const config = readJsonSafe(client.configPath);

  if (config.mcpServers?.['opensauria']) {
    return { client: client.name, status: 'already_registered' };
  }

  config.mcpServers = {
    ...config.mcpServers,
    opensauria: OPENSAURIA_MCP_ENTRY,
  };

  writeJsonPretty(client.configPath, config);
  return { client: client.name, status: 'registered' };
}

export function registerMcpInAllClients(clients: McpClient[]): RegistrationResult[] {
  return clients.map(registerMcpInClient);
}
