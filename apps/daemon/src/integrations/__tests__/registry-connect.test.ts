import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
}));

vi.mock('node:path', async () => {
  const actual = await vi.importActual<typeof import('node:path')>('node:path');
  return { ...actual };
});

vi.mock('../../utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { existsSync } from 'node:fs';
import type { IntegrationDefinition } from '@sauria/types';
import {
  connectIntegrationInstance,
  disconnectIntegrationInstance,
} from '../registry-connect.js';

const mockMcpClients = {
  connect: vi.fn(),
  disconnect: vi.fn(),
  listTools: vi.fn(),
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

const fakeDefWithTemplate: IntegrationDefinition = {
  ...fakeDef,
  id: 'templated',
  mcpServer: {
    package: '@mcp/test',
    envMapping: { token: 'AUTH_TOKEN' },
    envValueTemplate: { token: 'Bearer {value}' },
  },
} as IntegrationDefinition;

describe('connectIntegrationInstance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(existsSync).mockReturnValue(false);
  });

  it('throws when a required credential is missing', async () => {
    const instances = new Map();
    await expect(
      connectIntegrationInstance(
        'github:1',
        'github',
        'GitHub',
        {},
        fakeDef,
        mockMcpClients as never,
        mockAudit as never,
        instances,
      ),
    ).rejects.toThrow('Missing credential: token');
  });

  it('connects successfully and maps tools', async () => {
    mockMcpClients.connect.mockResolvedValue(undefined);
    mockMcpClients.listTools.mockResolvedValue([
      { name: 'list_repos', description: 'List repos' },
      { name: 'create_issue', description: 'Create issue' },
    ]);

    const instances = new Map();
    const result = await connectIntegrationInstance(
      'github:1',
      'github',
      'GitHub',
      { token: 'ghp_abc123' },
      fakeDef,
      mockMcpClients as never,
      mockAudit as never,
      instances,
    );

    expect(result.connected).toBe(true);
    expect(result.tools).toHaveLength(2);
    expect(result.tools[0]?.name).toBe('list_repos');
    expect(result.tools[0]?.integrationId).toBe('github');
    expect(instances.has('github:1')).toBe(true);
    expect(mockAudit.logAction).toHaveBeenCalledWith('integration:connect', expect.objectContaining({
      instanceId: 'github:1',
      toolCount: 2,
    }));
  });

  it('applies env value template when provided', async () => {
    mockMcpClients.connect.mockResolvedValue(undefined);
    mockMcpClients.listTools.mockResolvedValue([]);

    const instances = new Map();
    await connectIntegrationInstance(
      'templated:1',
      'templated',
      'Templated',
      { token: 'mytoken' },
      fakeDefWithTemplate,
      mockMcpClients as never,
      mockAudit as never,
      instances,
    );

    expect(mockMcpClients.connect).toHaveBeenCalledWith(
      expect.objectContaining({
        env: expect.objectContaining({ AUTH_TOKEN: 'Bearer mytoken' }),
      }),
    );
  });

  it('returns failure status on mcp connect error', async () => {
    mockMcpClients.connect.mockRejectedValue(new Error('Connection refused'));

    const instances = new Map();
    const result = await connectIntegrationInstance(
      'github:1',
      'github',
      'GitHub',
      { token: 'ghp_abc' },
      fakeDef,
      mockMcpClients as never,
      mockAudit as never,
      instances,
    );

    expect(result.connected).toBe(false);
    expect(result.error).toBe('Connection refused');
    expect(instances.has('github:1')).toBe(false);
    expect(mockAudit.logAction).toHaveBeenCalledWith(
      'integration:connect',
      expect.objectContaining({ error: 'Connection refused' }),
      { success: false },
    );
  });

  it('uses npx fallback when not found in node dir', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    mockMcpClients.connect.mockResolvedValue(undefined);
    mockMcpClients.listTools.mockResolvedValue([]);

    const instances = new Map();
    await connectIntegrationInstance(
      'github:1',
      'github',
      'GitHub',
      { token: 'ghp_abc' },
      fakeDef,
      mockMcpClients as never,
      mockAudit as never,
      instances,
    );

    expect(mockMcpClients.connect).toHaveBeenCalledWith(
      expect.objectContaining({ command: 'npx' }),
    );
  });
});

describe('disconnectIntegrationInstance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('disconnects and removes from instances map', async () => {
    const instances = new Map([
      ['github:1', { instanceId: 'github:1', integrationId: 'github', label: 'GH', tools: [], connectedAt: '2026-01-01' }],
    ]);

    mockMcpClients.disconnect.mockResolvedValue(undefined);

    await disconnectIntegrationInstance(
      'github:1',
      mockMcpClients as never,
      mockAudit as never,
      instances,
    );

    expect(instances.has('github:1')).toBe(false);
    expect(mockAudit.logAction).toHaveBeenCalledWith('integration:disconnect', { instanceId: 'github:1' });
  });

  it('handles disconnect error gracefully', async () => {
    const instances = new Map([
      ['github:1', { instanceId: 'github:1', integrationId: 'github', label: 'GH', tools: [], connectedAt: '2026-01-01' }],
    ]);

    mockMcpClients.disconnect.mockRejectedValue(new Error('Already disconnected'));

    await disconnectIntegrationInstance(
      'github:1',
      mockMcpClients as never,
      mockAudit as never,
      instances,
    );

    expect(instances.has('github:1')).toBe(false);
  });
});
