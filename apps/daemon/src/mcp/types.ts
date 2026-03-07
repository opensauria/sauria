import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

export type McpTransport = StdioClientTransport | StreamableHTTPClientTransport | SSEClientTransport;

export interface McpServerConfig {
  readonly name: string;
  readonly command: string;
  readonly args: readonly string[];
  readonly env?: Readonly<Record<string, string>>;
  readonly cwd?: string;
}

export interface ConnectedClient {
  readonly name: string;
  readonly client: Client;
  readonly transport: McpTransport;
  readonly config: McpServerConfig;
}

export interface HealthCheckResult {
  readonly name: string;
  readonly status: 'healthy' | 'reconnected' | 'failed';
  readonly error?: string;
}
