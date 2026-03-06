import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import type { Logger } from '../utils/logger.js';

export interface RemoteMcpConfig {
  readonly name: string;
  readonly url: string;
  readonly accessToken: string;
}

export interface RemoteMcpConnection {
  readonly client: Client;
  readonly transport: StreamableHTTPClientTransport | SSEClientTransport;
}

export async function connectRemoteMcp(
  config: RemoteMcpConfig,
  logger: Logger,
): Promise<RemoteMcpConnection> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.accessToken}`,
  };

  // Try Streamable HTTP first (MCP 2025-03-26+), fall back to SSE
  try {
    const transport = new StreamableHTTPClientTransport(new URL(config.url), {
      requestInit: { headers },
    });
    const client = new Client({ name: 'sauria', version: '1.0.0' });
    await client.connect(transport);
    logger.info(`Connected to remote MCP: ${config.name} via Streamable HTTP`);
    return { client, transport };
  } catch {
    const transport = new SSEClientTransport(new URL(config.url), {
      requestInit: { headers },
    });
    const client = new Client({ name: 'sauria', version: '1.0.0' });
    await client.connect(transport);
    logger.info(`Connected to remote MCP: ${config.name} via SSE`);
    return { client, transport };
  }
}
