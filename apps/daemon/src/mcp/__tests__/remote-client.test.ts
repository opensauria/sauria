import { describe, it, expect, vi, beforeEach } from 'vitest';

let mockConnect: (...args: unknown[]) => unknown;

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => {
  const MockClient = vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.connect = (...args: unknown[]) => mockConnect(...args);
    return this;
  });
  return { Client: MockClient };
});

vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({
  StreamableHTTPClientTransport: vi.fn(),
}));

vi.mock('@modelcontextprotocol/sdk/client/sse.js', () => ({
  SSEClientTransport: vi.fn(),
}));

import { connectRemoteMcp } from '../remote-client.js';
import type { RemoteMcpConfig } from '../remote-client.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import type { Logger } from '../../utils/logger.js';

const mockLogger: Logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
} as unknown as Logger;

const config: RemoteMcpConfig = {
  name: 'test-server',
  url: 'https://example.com/mcp',
  accessToken: 'test-token-123',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockConnect = vi.fn().mockResolvedValue(undefined);
});

describe('connectRemoteMcp', () => {
  it('connects via Streamable HTTP when it succeeds', async () => {
    const result = await connectRemoteMcp(config, mockLogger);

    expect(result.client).toBeDefined();
    expect(result.transport).toBeDefined();
    expect(StreamableHTTPClientTransport).toHaveBeenCalledTimes(1);
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('test-server via Streamable HTTP'),
    );
  });

  it('falls back to SSE when Streamable HTTP fails', async () => {
    let callCount = 0;
    mockConnect = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        throw new Error('Streamable HTTP not supported');
      }
      return Promise.resolve(undefined);
    });

    const result = await connectRemoteMcp(config, mockLogger);

    expect(result.client).toBeDefined();
    expect(SSEClientTransport).toHaveBeenCalledTimes(1);
    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('test-server via SSE'));
  });

  it('propagates error when both transports fail', async () => {
    mockConnect = vi.fn().mockRejectedValue(new Error('Connection refused'));

    await expect(connectRemoteMcp(config, mockLogger)).rejects.toThrow('Connection refused');
  });
});
