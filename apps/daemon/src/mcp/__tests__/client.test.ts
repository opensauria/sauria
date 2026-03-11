import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: class {
    connect = vi.fn().mockResolvedValue(undefined);
    close = vi.fn().mockResolvedValue(undefined);
    callTool = vi.fn();
    listTools = vi.fn();
    constructor(_info: unknown, _opts: unknown) {}
  },
}));
vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: class {
    constructor(_opts: unknown) {}
  },
}));
vi.mock('../../security/rate-limiter.js', () => ({
  SECURITY_LIMITS: { mcp: { maxQueriesPerMinute: 30, maxConcurrentClients: 2 } },
}));
vi.mock('./health.js', () => ({
  McpHealthMonitor: class {
    healthCheck = vi.fn().mockResolvedValue([]);
    start = vi.fn();
    stop = vi.fn();
    constructor(_clients: unknown, _audit: unknown, _reconnect: unknown) {}
  },
}));
vi.mock('../health.js', () => ({
  McpHealthMonitor: class {
    healthCheck = vi.fn().mockResolvedValue([]);
    start = vi.fn();
    stop = vi.fn();
    constructor(_clients: unknown, _audit: unknown, _reconnect: unknown) {}
  },
}));
vi.mock('../remote-client.js', () => ({
  connectRemoteMcp: vi.fn().mockResolvedValue({
    client: {
      connect: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      callTool: vi.fn(),
      listTools: vi.fn(),
    },
    transport: {},
  }),
}));
vi.mock('../../utils/logger.js', () => ({
  getLogger: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
}));

import { McpClientManager } from '../client.js';

const mockAudit = {
  logAction: vi.fn(),
  hashContent: vi.fn(() => 'hash'),
} as unknown as import('../../security/audit.js').AuditLogger;

let manager: McpClientManager;

beforeEach(() => {
  vi.clearAllMocks();
  manager = new McpClientManager(mockAudit);
});

describe('McpClientManager', () => {
  const config = { name: 'test-server', command: 'node', args: ['server.js'] };

  describe('connect', () => {
    it('connects a new server', async () => {
      await manager.connect(config);
      expect(manager.getConnectedServers()).toContain('test-server');
      expect(mockAudit.logAction).toHaveBeenCalledWith('mcp:client_connect', {
        server: 'test-server',
      });
    });

    it('throws when server is already connected', async () => {
      await manager.connect(config);
      await expect(manager.connect(config)).rejects.toThrow('already connected');
    });

    it('throws when max concurrent clients reached', async () => {
      await manager.connect({ name: 'a', command: 'node', args: [] });
      await manager.connect({ name: 'b', command: 'node', args: [] });
      await expect(manager.connect({ name: 'c', command: 'node', args: [] })).rejects.toThrow(
        'Maximum concurrent',
      );
    });
  });

  describe('disconnect', () => {
    it('disconnects a connected server', async () => {
      await manager.connect(config);
      await manager.disconnect('test-server');
      expect(manager.getConnectedServers()).not.toContain('test-server');
      expect(mockAudit.logAction).toHaveBeenCalledWith('mcp:client_disconnect', {
        server: 'test-server',
      });
    });

    it('throws when server is not connected', async () => {
      await expect(manager.disconnect('unknown')).rejects.toThrow('not connected');
    });
  });

  describe('disconnectAll', () => {
    it('disconnects all servers', async () => {
      await manager.connect({ name: 'a', command: 'node', args: [] });
      await manager.connect({ name: 'b', command: 'node', args: [] });
      await manager.disconnectAll();
      expect(manager.getConnectedServers()).toHaveLength(0);
    });
  });

  describe('callTool', () => {
    it('throws when server is not connected', async () => {
      await expect(manager.callTool('unknown', 'tool', {})).rejects.toThrow('not connected');
    });

    it('calls tool and returns text result', async () => {
      await manager.connect(config);
      const entry = (
        manager as unknown as {
          clients: Map<string, { client: { callTool: ReturnType<typeof vi.fn> } }>;
        }
      ).clients.get('test-server');
      entry?.client.callTool.mockResolvedValue({
        content: [{ type: 'text', text: '{"key":"value"}' }],
      });
      const result = await manager.callTool('test-server', 'my-tool', { arg: 1 });
      expect(result).toEqual({ key: 'value' });
    });

    it('returns raw text when JSON parse fails', async () => {
      await manager.connect(config);
      const entry = (
        manager as unknown as {
          clients: Map<string, { client: { callTool: ReturnType<typeof vi.fn> } }>;
        }
      ).clients.get('test-server');
      entry?.client.callTool.mockResolvedValue({
        content: [{ type: 'text', text: 'plain text result' }],
      });
      const result = await manager.callTool('test-server', 'my-tool', {});
      expect(result).toBe('plain text result');
    });

    it('returns multiple text parts as array', async () => {
      await manager.connect(config);
      const entry = (
        manager as unknown as {
          clients: Map<string, { client: { callTool: ReturnType<typeof vi.fn> } }>;
        }
      ).clients.get('test-server');
      entry?.client.callTool.mockResolvedValue({
        content: [
          { type: 'text', text: 'part1' },
          { type: 'text', text: 'part2' },
        ],
      });
      const result = await manager.callTool('test-server', 'my-tool', {});
      expect(result).toEqual(['part1', 'part2']);
    });

    it('throws on tool error', async () => {
      await manager.connect(config);
      const entry = (
        manager as unknown as {
          clients: Map<string, { client: { callTool: ReturnType<typeof vi.fn> } }>;
        }
      ).clients.get('test-server');
      entry?.client.callTool.mockResolvedValue({
        isError: true,
        content: [{ type: 'text', text: 'something broke' }],
      });
      await expect(manager.callTool('test-server', 'my-tool', {})).rejects.toThrow(
        'something broke',
      );
    });

    it('throws Unknown error when error content is not an array', async () => {
      await manager.connect(config);
      const entry = (
        manager as unknown as {
          clients: Map<string, { client: { callTool: ReturnType<typeof vi.fn> } }>;
        }
      ).clients.get('test-server');
      entry?.client.callTool.mockResolvedValue({
        isError: true,
        content: 'not-an-array',
      });
      await expect(manager.callTool('test-server', 'my-tool', {})).rejects.toThrow('Unknown error');
    });

    it('filters non-text content items from result', async () => {
      await manager.connect(config);
      const entry = (
        manager as unknown as {
          clients: Map<string, { client: { callTool: ReturnType<typeof vi.fn> } }>;
        }
      ).clients.get('test-server');
      entry?.client.callTool.mockResolvedValue({
        content: [
          { type: 'image', data: 'binary' },
          { type: 'text', text: 'hello' },
        ],
      });
      const result = await manager.callTool('test-server', 'my-tool', {});
      expect(result).toBe('hello');
    });

    it('connects with env and cwd options', async () => {
      await manager.connect({
        name: 'env-server',
        command: 'node',
        args: ['srv.js'],
        env: { MY_VAR: 'value' },
        cwd: '/some/path',
      });
      expect(manager.getConnectedServers()).toContain('env-server');
    });

    it('returns toolResult when content is not an array', async () => {
      await manager.connect(config);
      const entry = (
        manager as unknown as {
          clients: Map<string, { client: { callTool: ReturnType<typeof vi.fn> } }>;
        }
      ).clients.get('test-server');
      entry?.client.callTool.mockResolvedValue({
        content: 'not-array',
        toolResult: 42,
      });
      const result = await manager.callTool('test-server', 'my-tool', {});
      expect(result).toBe(42);
    });
  });

  describe('listTools', () => {
    it('throws when server is not connected', async () => {
      await expect(manager.listTools('unknown')).rejects.toThrow('not connected');
    });

    it('returns tool info list', async () => {
      await manager.connect(config);
      const entry = (
        manager as unknown as {
          clients: Map<string, { client: { listTools: ReturnType<typeof vi.fn> } }>;
        }
      ).clients.get('test-server');
      entry?.client.listTools.mockResolvedValue({
        tools: [{ name: 'tool1', description: 'desc1' }, { name: 'tool2' }],
      });
      const tools = await manager.listTools('test-server');
      expect(tools).toEqual([
        { name: 'tool1', description: 'desc1' },
        { name: 'tool2', description: undefined },
      ]);
    });
  });

  describe('getConnectedServers', () => {
    it('returns empty array when no servers connected', () => {
      expect(manager.getConnectedServers()).toEqual([]);
    });
  });

  describe('healthCheck', () => {
    it('delegates to health monitor', async () => {
      const results = await manager.healthCheck();
      expect(results).toEqual([]);
    });
  });

  describe('startHealthMonitor / stopHealthMonitor', () => {
    it('delegates start and stop calls', () => {
      expect(() => manager.startHealthMonitor(5000)).not.toThrow();
      expect(() => manager.stopHealthMonitor()).not.toThrow();
    });
  });
});
