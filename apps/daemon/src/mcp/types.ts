import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

export interface McpServerConfig {
  readonly name: string;
  readonly command: string;
  readonly args: readonly string[];
  readonly env?: Readonly<Record<string, string>>;
}

export interface ConnectedClient {
  readonly name: string;
  readonly client: Client;
  readonly transport: StdioClientTransport;
  readonly config: McpServerConfig;
}

export interface HealthCheckResult {
  readonly name: string;
  readonly status: 'healthy' | 'reconnected' | 'failed';
  readonly error?: string;
}
