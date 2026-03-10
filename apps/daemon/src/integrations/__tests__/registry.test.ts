import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ConnectedInstance } from '../registry.js';

vi.mock('node:fs', () => ({
  mkdirSync: vi.fn(),
}));

vi.mock('node:os', () => ({
  homedir: () => '/mock-home',
}));

vi.mock('../registry-connect.js', () => ({
  connectIntegrationInstance: vi.fn(),
  disconnectIntegrationInstance: vi.fn(),
}));

vi.mock('../../utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import type { IntegrationDefinition, IntegrationTool } from '@sauria/types';
import { IntegrationRegistry } from '../registry.js';
import {
  connectIntegrationInstance,
  disconnectIntegrationInstance,
} from '../registry-connect.js';

const mockMcpClients = {
  connect: vi.fn(),
  connectRemote: vi.fn(),
  disconnect: vi.fn(),
  listTools: vi.fn(),
  callTool: vi.fn(),
};

const mockAudit = {
  logAction: vi.fn(),
};

const fakeDef: IntegrationDefinition = {
  id: 'github',
  name: 'GitHub',
  description: 'GitHub integration',
  icon: 'github',
  category: 'development',
  authType: 'api_key',
  credentialKeys: ['token'],
  mcpServer: {
    package: '@modelcontextprotocol/server-github',
    envMapping: { token: 'GITHUB_TOKEN' },
  },
} as IntegrationDefinition;

const fakeRemoteDef: IntegrationDefinition = {
  ...fakeDef,
  id: 'remote-svc',
  name: 'Remote Service',
  mcpRemote: { url: 'https://remote.example.com/mcp' },
} as IntegrationDefinition;

function createRegistry(catalog: readonly IntegrationDefinition[] = [fakeDef]) {
  return new IntegrationRegistry(
    mockMcpClients as never,
    mockAudit as never,
    catalog,
  );
}

/** Helper: make connectIntegrationInstance mock also populate the instances map */
function mockConnectPopulating(
  instanceId: string,
  integrationId: string,
  label: string,
  tools: IntegrationTool[] = [],
): void {
  vi.mocked(connectIntegrationInstance).mockImplementation(
    async (_iid, _intId, _label, _creds, _def, _mcp, _audit, instances) => {
      const entry: ConnectedInstance = {
        instanceId,
        integrationId,
        label,
        tools,
        connectedAt: new Date().toISOString(),
      };
      instances.set(instanceId, entry);
      return { instanceId, integrationId, label, connected: true, tools };
    },
  );
}

describe('IntegrationRegistry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('connect', () => {
    it('throws for unknown integration id', async () => {
      const registry = createRegistry();
      await expect(registry.connect('unknown', {})).rejects.toThrow('Unknown integration: unknown');
    });

    it('delegates to connectInstance for known integration', async () => {
      const tools: IntegrationTool[] = [
        { instanceId: 'github:default', integrationId: 'github', integrationName: 'GitHub', name: 'list_repos', description: 'List repos' },
      ];
      mockConnectPopulating('github:default', 'github', 'GitHub', tools);

      const registry = createRegistry();
      const result = await registry.connect('github', { token: 'abc' });

      expect(result.id).toBe('github');
      expect(result.connected).toBe(true);
      expect(result.tools).toEqual(tools);
      expect(result.definition).toBe(fakeDef);
    });
  });

  describe('disconnect', () => {
    it('disconnects by default instance id', async () => {
      mockConnectPopulating('github:default', 'github', 'GitHub');

      const registry = createRegistry();
      await registry.connect('github', { token: 'abc' });
      await registry.disconnect('github');

      expect(disconnectIntegrationInstance).toHaveBeenCalledWith(
        'github:default',
        expect.anything(),
        expect.anything(),
        expect.anything(),
      );
    });

    it('does nothing when not connected', async () => {
      const registry = createRegistry();
      await registry.disconnect('github');
      expect(disconnectIntegrationInstance).not.toHaveBeenCalled();
    });
  });

  describe('disconnectAll', () => {
    it('disconnects all connected instances', async () => {
      mockConnectPopulating('github:default', 'github', 'GitHub');

      const registry = createRegistry();
      await registry.connect('github', { token: 'abc' });
      await registry.disconnectAll();

      expect(disconnectIntegrationInstance).toHaveBeenCalled();
    });
  });

  describe('getCatalogWithStatus', () => {
    it('returns all catalog items with connected status', async () => {
      mockConnectPopulating('github:default', 'github', 'GitHub');

      const registry = createRegistry();
      await registry.connect('github', { token: 'abc' });

      const statuses = registry.getCatalogWithStatus();
      expect(statuses).toHaveLength(1);
      expect(statuses[0]?.connected).toBe(true);
    });

    it('returns disconnected status when not connected', () => {
      const registry = createRegistry();
      const statuses = registry.getCatalogWithStatus();
      expect(statuses).toHaveLength(1);
      expect(statuses[0]?.connected).toBe(false);
      expect(statuses[0]?.tools).toEqual([]);
    });
  });

  describe('getAvailableTools', () => {
    it('returns empty when no instances connected', () => {
      const registry = createRegistry();
      expect(registry.getAvailableTools()).toEqual([]);
    });

    it('returns tools for specific integration', async () => {
      const tools: IntegrationTool[] = [
        { instanceId: 'github:default', integrationId: 'github', integrationName: 'GitHub', name: 'tool1', description: 'desc' },
      ];
      mockConnectPopulating('github:default', 'github', 'GitHub', tools);

      const registry = createRegistry();
      await registry.connect('github', { token: 'abc' });

      expect(registry.getAvailableTools('github')).toEqual(tools);
    });

    it('returns empty array for unknown integration id', () => {
      const registry = createRegistry();
      expect(registry.getAvailableTools('unknown')).toEqual([]);
    });

    it('returns all tools when no id specified', async () => {
      const tools: IntegrationTool[] = [
        { instanceId: 'github:default', integrationId: 'github', integrationName: 'GitHub', name: 'tool1', description: 'desc' },
      ];
      mockConnectPopulating('github:default', 'github', 'GitHub', tools);

      const registry = createRegistry();
      await registry.connect('github', { token: 'abc' });

      expect(registry.getAvailableTools()).toEqual(tools);
    });
  });

  describe('callTool', () => {
    it('throws when integration not connected', async () => {
      const registry = createRegistry();
      await expect(registry.callTool('github', 'list_repos', {})).rejects.toThrow(
        'Integration not connected: github',
      );
    });

    it('calls mcp client with resolved tool name', async () => {
      mockConnectPopulating('github:default', 'github', 'GitHub');
      mockMcpClients.callTool.mockResolvedValue({ result: 'ok' });

      const registry = createRegistry();
      await registry.connect('github', { token: 'abc' });

      await registry.callTool('github', 'ns/list_repos', { owner: 'me' });
      expect(mockMcpClients.callTool).toHaveBeenCalledWith(
        'integration:github:default',
        'list_repos',
        { owner: 'me' },
      );
    });

    it('passes tool name as-is when no slash prefix', async () => {
      mockConnectPopulating('github:default', 'github', 'GitHub');
      mockMcpClients.callTool.mockResolvedValue('ok');

      const registry = createRegistry();
      await registry.connect('github', { token: 'abc' });

      await registry.callTool('github', 'list_repos', {});
      expect(mockMcpClients.callTool).toHaveBeenCalledWith(
        'integration:github:default',
        'list_repos',
        {},
      );
    });
  });

  describe('getConnectedIds', () => {
    it('returns empty when nothing connected', () => {
      const registry = createRegistry();
      expect(registry.getConnectedIds()).toEqual([]);
    });

    it('returns ids of connected instances', async () => {
      mockConnectPopulating('github:default', 'github', 'GitHub');

      const registry = createRegistry();
      await registry.connect('github', { token: 'abc' });

      expect(registry.getConnectedIds()).toContain('github:default');
    });
  });

  describe('connectInstance', () => {
    it('throws for unknown integration id', async () => {
      const registry = createRegistry();
      await expect(
        registry.connectInstance('test:1', 'unknown', 'Test', {}),
      ).rejects.toThrow('Unknown integration: unknown');
    });

    it('passes remote option when mcpRemote and accessToken present', async () => {
      vi.mocked(connectIntegrationInstance).mockResolvedValue({
        instanceId: 'remote-svc:1',
        integrationId: 'remote-svc',
        label: 'Remote',
        connected: true,
        tools: [],
      });

      const registry = createRegistry([fakeRemoteDef]);
      await registry.connectInstance('remote-svc:1', 'remote-svc', 'Remote', {
        accessToken: 'tok123',
      });

      expect(connectIntegrationInstance).toHaveBeenCalledWith(
        'remote-svc:1',
        'remote-svc',
        'Remote',
        { accessToken: 'tok123' },
        fakeRemoteDef,
        expect.anything(),
        expect.anything(),
        expect.anything(),
        { remote: true, workdir: expect.stringContaining('mcp-workdirs') },
      );
    });

    it('passes local option when no mcpRemote', async () => {
      vi.mocked(connectIntegrationInstance).mockResolvedValue({
        instanceId: 'github:1',
        integrationId: 'github',
        label: 'GH',
        connected: true,
        tools: [],
      });

      const registry = createRegistry();
      await registry.connectInstance('github:1', 'github', 'GH', { token: 'abc' });

      expect(connectIntegrationInstance).toHaveBeenCalledWith(
        'github:1',
        'github',
        'GH',
        { token: 'abc' },
        fakeDef,
        expect.anything(),
        expect.anything(),
        expect.anything(),
        { remote: false, workdir: expect.stringContaining('mcp-workdirs') },
      );
    });
  });

  describe('refreshRemoteConnection', () => {
    it('does nothing when instance not found', async () => {
      const registry = createRegistry([fakeRemoteDef]);
      await registry.refreshRemoteConnection('nonexistent:1', 'new-token');
      expect(mockMcpClients.disconnect).not.toHaveBeenCalled();
    });

    it('reconnects with new token for remote integration', async () => {
      mockConnectPopulating('remote-svc:default', 'remote-svc', 'Remote');
      mockMcpClients.disconnect.mockResolvedValue(undefined);
      mockMcpClients.connectRemote.mockResolvedValue(undefined);

      const registry = createRegistry([fakeRemoteDef]);
      await registry.connect('remote-svc', { accessToken: 'old-token' });

      await registry.refreshRemoteConnection('remote-svc:default', 'new-token');

      expect(mockMcpClients.disconnect).toHaveBeenCalledWith('integration:remote-svc:default');
      expect(mockMcpClients.connectRemote).toHaveBeenCalledWith({
        name: 'integration:remote-svc:default',
        url: 'https://remote.example.com/mcp',
        accessToken: 'new-token',
      });
    });
  });

  describe('getToolsForInstances', () => {
    it('returns tools from specified instances', async () => {
      const tools: IntegrationTool[] = [
        { instanceId: 'github:default', integrationId: 'github', integrationName: 'GitHub', name: 'tool1', description: 'desc' },
      ];
      mockConnectPopulating('github:default', 'github', 'GitHub', tools);

      const registry = createRegistry();
      await registry.connect('github', { token: 'abc' });

      expect(registry.getToolsForInstances(['github:default'])).toEqual(tools);
      expect(registry.getToolsForInstances(['nonexistent'])).toEqual([]);
    });
  });

  describe('callToolForInstance', () => {
    it('throws when instance not connected', async () => {
      const registry = createRegistry();
      await expect(
        registry.callToolForInstance('github:1', 'tool', {}),
      ).rejects.toThrow('Instance not connected: github:1');
    });

    it('calls tool via mcp client', async () => {
      mockConnectPopulating('github:default', 'github', 'GitHub');
      mockMcpClients.callTool.mockResolvedValue('result');

      const registry = createRegistry();
      await registry.connect('github', { token: 'abc' });

      const result = await registry.callToolForInstance('github:default', 'list', {});
      expect(result).toBe('result');
      expect(mockMcpClients.callTool).toHaveBeenCalledWith(
        'integration:github:default',
        'list',
        {},
      );
    });
  });

  describe('getInstanceList', () => {
    it('returns empty array when no instances', () => {
      const registry = createRegistry();
      expect(registry.getInstanceList()).toEqual([]);
    });

    it('returns mapped instance list', async () => {
      mockConnectPopulating('github:default', 'github', 'GitHub');

      const registry = createRegistry();
      await registry.connect('github', { token: 'abc' });

      const list = registry.getInstanceList();
      expect(list).toHaveLength(1);
      expect(list[0]?.id).toBe('github:default');
      expect(list[0]?.integrationId).toBe('github');
      expect(list[0]?.label).toBe('GitHub');
      expect(list[0]?.connectedAt).toBeDefined();
    });
  });
});
