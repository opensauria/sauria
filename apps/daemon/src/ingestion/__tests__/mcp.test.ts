import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockConnect = vi.fn(async () => undefined);
const mockListTools = vi.fn(async () => ({
  tools: [{ name: 'tool-a' }, { name: 'tool-b' }],
}));
const mockCallTool = vi.fn(
  async (): Promise<Record<string, unknown>> => ({
    content: [{ type: 'text', text: '{"result": true}' }],
  }),
);
const mockClose = vi.fn(async () => undefined);

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: class MockClient {
    connect = mockConnect;
    listTools = mockListTools;
    callTool = mockCallTool;
  },
}));

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: class MockTransport {
    close = mockClose;
  },
}));

import { McpSourceClient, connectToMcpSource } from '../sources/mcp.js';

describe('McpSourceClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCallTool.mockResolvedValue({
      content: [{ type: 'text', text: '{"result": true}' }],
    });
  });

  describe('connect', () => {
    it('creates a connected client', async () => {
      const client = await McpSourceClient.connect({
        command: 'node',
        args: ['server.js'],
        autoIngest: false,
        interval: 300,
      });

      expect(client).toBeDefined();
      expect(mockConnect).toHaveBeenCalledOnce();
    });
  });

  describe('listTools', () => {
    it('returns tool names', async () => {
      const client = await McpSourceClient.connect({
        command: 'node',
        args: [],
        autoIngest: false,
        interval: 300,
      });

      const tools = await client.listTools();
      expect(tools).toEqual(['tool-a', 'tool-b']);
    });
  });

  describe('callTool', () => {
    it('parses JSON from single text content part', async () => {
      const client = await McpSourceClient.connect({
        command: 'node',
        args: [],
        autoIngest: false,
        interval: 300,
      });

      const result = await client.callTool('test', {});
      expect(result).toEqual({ result: true });
    });

    it('returns text array when multiple text parts', async () => {
      mockCallTool.mockResolvedValue({
        content: [
          { type: 'text', text: 'line1' },
          { type: 'text', text: 'line2' },
        ],
      });

      const client = await McpSourceClient.connect({
        command: 'node',
        args: [],
        autoIngest: false,
        interval: 300,
      });
      const result = await client.callTool('test', {});
      expect(result).toEqual(['line1', 'line2']);
    });

    it('returns toolResult when content property is missing', async () => {
      mockCallTool.mockResolvedValue({
        toolResult: 'direct-result',
      });

      const client = await McpSourceClient.connect({
        command: 'node',
        args: [],
        autoIngest: false,
        interval: 300,
      });
      const result = await client.callTool('test', {});
      expect(result).toBe('direct-result');
    });

    it('throws on isError responses', async () => {
      mockCallTool.mockResolvedValue({
        isError: true,
        content: [{ type: 'text', text: 'Something broke' }],
      });

      const client = await McpSourceClient.connect({
        command: 'node',
        args: [],
        autoIngest: false,
        interval: 300,
      });
      await expect(client.callTool('broken', {})).rejects.toThrow(
        'MCP tool "broken" failed: Something broke',
      );
    });

    it('returns plain text when JSON parsing fails', async () => {
      mockCallTool.mockResolvedValue({
        content: [{ type: 'text', text: 'not json' }],
      });

      const client = await McpSourceClient.connect({
        command: 'node',
        args: [],
        autoIngest: false,
        interval: 300,
      });
      const result = await client.callTool('test', {});
      expect(result).toBe('not json');
    });

    it('returns raw result when content is not an array', async () => {
      mockCallTool.mockResolvedValue({
        content: 'raw-string',
      });

      const client = await McpSourceClient.connect({
        command: 'node',
        args: [],
        autoIngest: false,
        interval: 300,
      });
      const result = await client.callTool('test', {});
      expect(result).toEqual({ content: 'raw-string' });
    });
  });

  describe('disconnect', () => {
    it('closes the transport', async () => {
      const client = await McpSourceClient.connect({
        command: 'node',
        args: [],
        autoIngest: false,
        interval: 300,
      });

      await expect(client.disconnect()).resolves.not.toThrow();
      expect(mockClose).toHaveBeenCalledOnce();
    });
  });
});

describe('connectToMcpSource', () => {
  it('delegates to McpSourceClient.connect', async () => {
    const client = await connectToMcpSource({
      command: 'node',
      args: ['server.js'],
      autoIngest: false,
      interval: 300,
    });
    expect(client).toBeDefined();
  });
});
