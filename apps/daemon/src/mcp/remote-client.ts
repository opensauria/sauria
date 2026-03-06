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
  const url = new URL(config.url);

  // Try Streamable HTTP first (MCP 2025-03-26+), fall back to SSE
  try {
    return await connectWithTransport(
      new StreamableHTTPClientTransport(url, { requestInit: { headers } }),
      config.name,
      'Streamable HTTP',
      logger,
    );
  } catch {
    return connectWithTransport(
      new SSEClientTransport(url, { requestInit: { headers } }),
      config.name,
      'SSE',
      logger,
    );
  }
}

async function connectWithTransport(
  transport: StreamableHTTPClientTransport | SSEClientTransport,
  name: string,
  protocol: string,
  logger: Logger,
): Promise<RemoteMcpConnection> {
  const client = new Client({ name: 'sauria', version: '1.0.0' });
  await client.connect(transport);
  logger.info(`Connected to remote MCP: ${name} via ${protocol}`);
  return { client, transport };
}
