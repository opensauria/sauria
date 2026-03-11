import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { McpHealthMonitor } from '../health.js';
import type { ConnectedClient } from '../types.js';

vi.mock('../../utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

function makeClient(overrides: Partial<{ listToolsFails: boolean }> = {}): ConnectedClient {
  return {
    name: 'test-server',
    client: {
      listTools: overrides.listToolsFails
        ? vi.fn().mockRejectedValue(new Error('connection refused'))
        : vi.fn().mockResolvedValue([]),
    } as unknown as ConnectedClient['client'],
    transport: {} as ConnectedClient['transport'],
    config: { name: 'test-server', command: 'node', args: ['server.js'] },
  };
}

describe('McpHealthMonitor', () => {
  let audit: { logAction: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.useFakeTimers();
    audit = { logAction: vi.fn() };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('healthCheck', () => {
    it('returns healthy for responsive clients', async () => {
      const clients = new Map<string, ConnectedClient>();
      clients.set('srv1', makeClient());
      const reconnect = vi.fn();
      const monitor = new McpHealthMonitor(clients, audit as never, reconnect);

      const results = await monitor.healthCheck();
      expect(results).toHaveLength(1);
      expect(results[0]?.status).toBe('healthy');
      expect(reconnect).not.toHaveBeenCalled();
    });

    it('attempts reconnect for failed clients', async () => {
      const clients = new Map<string, ConnectedClient>();
      clients.set('srv1', makeClient({ listToolsFails: true }));
      const reconnect = vi.fn().mockResolvedValue(undefined);
      const monitor = new McpHealthMonitor(clients, audit as never, reconnect);

      const results = await monitor.healthCheck();
      expect(reconnect).toHaveBeenCalledOnce();
      expect(results[0]?.status).toBe('reconnected');
    });

    it('reports failed when reconnect also fails', async () => {
      const clients = new Map<string, ConnectedClient>();
      clients.set('srv1', makeClient({ listToolsFails: true }));
      const reconnect = vi.fn().mockRejectedValue(new Error('still down'));
      const monitor = new McpHealthMonitor(clients, audit as never, reconnect);

      const results = await monitor.healthCheck();
      expect(results[0]?.status).toBe('failed');
      expect(results[0]?.error).toBe('still down');
    });

    it('logs audit action with counts', async () => {
      const clients = new Map<string, ConnectedClient>();
      clients.set('healthy-srv', makeClient());
      clients.set('failing-srv', makeClient({ listToolsFails: true }));
      const reconnect = vi.fn().mockRejectedValue(new Error('down'));
      const monitor = new McpHealthMonitor(clients, audit as never, reconnect);

      await monitor.healthCheck();
      expect(audit.logAction).toHaveBeenCalledWith('mcp:health_check', {
        total: 2,
        healthy: 1,
        reconnected: 0,
        failed: 1,
      });
    });

    it('handles empty client map', async () => {
      const clients = new Map<string, ConnectedClient>();
      const reconnect = vi.fn();
      const monitor = new McpHealthMonitor(clients, audit as never, reconnect);

      const results = await monitor.healthCheck();
      expect(results).toHaveLength(0);
    });
  });

  describe('start/stop', () => {
    it('stop clears interval and prevents further checks', () => {
      const clients = new Map<string, ConnectedClient>();
      const reconnect = vi.fn();
      const monitor = new McpHealthMonitor(clients, audit as never, reconnect);

      monitor.start(5000);
      monitor.stop();

      // Advance past interval; no errors thrown
      vi.advanceTimersByTime(10_000);
    });

    it('catches errors thrown during periodic health check cycle', async () => {
      const failAudit = {
        logAction: vi.fn().mockImplementation(() => {
          throw new Error('audit broken');
        }),
      };
      const clients = new Map<string, ConnectedClient>();
      clients.set('srv1', makeClient());
      const reconnect = vi.fn();
      const monitor = new McpHealthMonitor(clients, failAudit as never, reconnect);

      monitor.start(1000);
      await vi.advanceTimersByTimeAsync(1000);

      // Should not crash — error caught by .catch()
      monitor.stop();
    });
  });
});
