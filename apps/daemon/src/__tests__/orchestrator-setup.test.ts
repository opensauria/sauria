import { describe, it, expect, vi, beforeEach } from 'vitest';
import { connectMcpSources, autoConnectIntegrations, setupOrchestrator } from '../orchestrator-setup.js';
import type { CanvasGraph, AgentNode } from '../orchestrator/types.js';

vi.mock('../utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('../security/vault-key.js', () => ({
  vaultGet: vi.fn().mockResolvedValue(null),
}));

vi.mock('../integrations/catalog.js', () => ({
  INTEGRATION_CATALOG: [
    { id: 'linear', credentialKeys: ['api_key'] },
  ],
}));

vi.mock('../channel-factory.js', () => ({
  createChannelForNode: vi.fn().mockResolvedValue(null),
}));

vi.mock('../config/paths.js', () => ({
  paths: { canvas: '/mock/canvas.json' },
}));

vi.mock('../graph-loader.js', () => ({
  buildOwnerIdentity: vi.fn().mockReturnValue({ name: 'Owner', telegramUserId: 123 }),
  loadCanvasGraph: vi.fn().mockReturnValue({ nodes: [], edges: [], workspaces: [] }),
}));

vi.mock('../graph-persistence.js', () => ({
  persistCanvasGraph: vi.fn(),
}));

vi.mock('../channels/registry.js', () => {
  class MockChannelRegistry {
    register = vi.fn();
    getAll = vi.fn().mockReturnValue([]);
    stopAll = vi.fn();
  }
  return { ChannelRegistry: MockChannelRegistry };
});

vi.mock('../orchestrator/orchestrator.js', () => {
  class MockOrchestrator {
    handleInbound = vi.fn();
    updateGraph = vi.fn();
  }
  return { AgentOrchestrator: MockOrchestrator };
});

vi.mock('../orchestrator/llm-router.js', () => {
  class MockBrain {}
  return { LLMRoutingBrain: MockBrain };
});

vi.mock('../orchestrator/message-queue.js', () => {
  class MockQueue {
    enqueue = vi.fn();
  }
  return { MessageQueue: MockQueue };
});

vi.mock('../orchestrator/agent-memory.js', () => {
  class MockMemory {}
  return { AgentMemory: MockMemory };
});

vi.mock('../orchestrator/kpi-tracker.js', () => {
  class MockTracker {}
  return { KPITracker: MockTracker };
});

vi.mock('../orchestrator/code-mode-router.js', () => {
  class MockRouter {
    setSessionPersistCallback = vi.fn();
  }
  return { CodeModeRouter: MockRouter };
});

describe('connectMcpSources', () => {
  it('connects each configured MCP server', async () => {
    const mcpClients = { connect: vi.fn().mockResolvedValue(undefined) };
    const config = {
      mcp: {
        servers: {
          'server-a': { command: 'node', args: ['a.js'] },
          'server-b': { command: 'node', args: ['b.js'] },
        },
      },
    } as never;

    await connectMcpSources(config, mcpClients);

    expect(mcpClients.connect).toHaveBeenCalledTimes(2);
    expect(mcpClients.connect).toHaveBeenCalledWith({
      name: 'server-a',
      command: 'node',
      args: ['a.js'],
    });
  });

  it('skips null server configs', async () => {
    const mcpClients = { connect: vi.fn().mockResolvedValue(undefined) };
    const config = {
      mcp: {
        servers: {
          'server-a': null,
          'server-b': { command: 'node', args: [] },
        },
      },
    } as never;

    await connectMcpSources(config, mcpClients);

    expect(mcpClients.connect).toHaveBeenCalledTimes(1);
  });

  it('handles connection errors without throwing', async () => {
    const mcpClients = { connect: vi.fn().mockRejectedValue(new Error('fail')) };
    const config = {
      mcp: {
        servers: { bad: { command: 'no', args: [] } },
      },
    } as never;

    await expect(connectMcpSources(config, mcpClients)).resolves.toBeUndefined();
  });
});

describe('autoConnectIntegrations', () => {
  it('skips integrations that are not enabled', async () => {
    const registry = { connect: vi.fn() } as never;
    const config = {
      integrations: {
        linear: { enabled: false },
      },
    } as never;

    await autoConnectIntegrations(registry, config);

    expect((registry as { connect: ReturnType<typeof vi.fn> }).connect).not.toHaveBeenCalled();
  });

  it('skips if integration not in catalog', async () => {
    const registry = { connect: vi.fn() } as never;
    const config = {
      integrations: {
        unknown: { enabled: true },
      },
    } as never;

    await autoConnectIntegrations(registry, config);

    expect((registry as { connect: ReturnType<typeof vi.fn> }).connect).not.toHaveBeenCalled();
  });

  it('skips if credentials are missing from vault', async () => {
    const registry = { connect: vi.fn() } as never;
    const config = {
      integrations: {
        linear: { enabled: true },
      },
    } as never;

    await autoConnectIntegrations(registry, config);

    expect((registry as { connect: ReturnType<typeof vi.fn> }).connect).not.toHaveBeenCalled();
  });

  it('connects when all credentials are present', async () => {
    const { vaultGet } = await import('../security/vault-key.js');
    (vaultGet as ReturnType<typeof vi.fn>).mockResolvedValue('test-key');

    const registry = { connect: vi.fn().mockResolvedValue(undefined) } as never;
    const config = {
      integrations: {
        linear: { enabled: true },
      },
    } as never;

    await autoConnectIntegrations(registry, config);

    expect((registry as { connect: ReturnType<typeof vi.fn> }).connect).toHaveBeenCalledWith(
      'linear',
      { api_key: 'test-key' },
    );
  });

  it('handles connection errors without throwing', async () => {
    const { vaultGet } = await import('../security/vault-key.js');
    (vaultGet as ReturnType<typeof vi.fn>).mockResolvedValue('test-key');

    const registry = { connect: vi.fn().mockRejectedValue(new Error('fail')) } as never;
    const config = {
      integrations: {
        linear: { enabled: true },
      },
    } as never;

    await expect(autoConnectIntegrations(registry, config)).resolves.toBeUndefined();
  });

  it('handles empty integrations config', async () => {
    const registry = { connect: vi.fn() } as never;
    const config = {} as never;

    await expect(autoConnectIntegrations(registry, config)).resolves.toBeUndefined();
  });
});

describe('setupOrchestrator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeGraph(nodes: Partial<AgentNode>[] = []): CanvasGraph {
    return {
      nodes: nodes.map((n) => ({
        id: n.id ?? 'node-1',
        platform: n.platform ?? 'telegram',
        label: n.label ?? 'Bot',
        photo: null,
        position: { x: 0, y: 0 },
        status: n.status ?? 'connected',
        credentials: '',
        meta: {},
        globalInstructions: '',
        ...n,
      })) as AgentNode[],
      edges: [],
      workspaces: [],
      globalInstructions: '',
      version: 2,
      viewport: { x: 0, y: 0, zoom: 1 },
    };
  }

  it('returns null when no connected non-owner nodes', async () => {
    const graph = makeGraph([{ status: 'disconnected' }]);
    const deps = {
      db: {} as never,
      router: {} as never,
      audit: {} as never,
      config: { orchestrator: { routingCacheTtlMs: 5000, maxMessagesPerSecond: 10 } } as never,
    };

    const result = await setupOrchestrator(graph, deps, {} as never);

    expect(result).toBeNull();
  });

  it('returns null for owner-only nodes', async () => {
    const graph = makeGraph([{ platform: 'owner', status: 'connected' }]);
    const deps = {
      db: {} as never,
      router: {} as never,
      audit: {} as never,
      config: { orchestrator: { routingCacheTtlMs: 5000, maxMessagesPerSecond: 10 } } as never,
    };

    const result = await setupOrchestrator(graph, deps, {} as never);

    expect(result).toBeNull();
  });

  it('returns null when no channels can be created', async () => {
    const graph = makeGraph([{ id: 'node-1', platform: 'telegram', status: 'connected' }]);
    const deps = {
      db: {} as never,
      router: {} as never,
      audit: {} as never,
      config: { orchestrator: { routingCacheTtlMs: 5000, maxMessagesPerSecond: 10 } } as never,
    };

    const result = await setupOrchestrator(graph, deps, {} as never);

    expect(result).toBeNull();
  });

  it('returns orchestrator bundle when channels are created', async () => {
    const { createChannelForNode } = await import('../channel-factory.js');
    const mockChannel = {
      name: 'telegram',
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      sendAlert: vi.fn().mockResolvedValue(undefined),
      sendMessage: vi.fn().mockResolvedValue(undefined),
      sendToGroup: vi.fn().mockResolvedValue(undefined),
    };
    (createChannelForNode as ReturnType<typeof vi.fn>).mockResolvedValue(mockChannel);

    const graph = makeGraph([{ id: 'node-1', platform: 'telegram', status: 'connected' }]);
    const deps = {
      db: {} as never,
      router: {} as never,
      audit: {} as never,
      config: { orchestrator: { routingCacheTtlMs: 5000, maxMessagesPerSecond: 10 } } as never,
    };

    const result = await setupOrchestrator(graph, deps, {} as never);

    expect(result).not.toBeNull();
    expect(result!.startedChannels).toHaveLength(1);
    expect(mockChannel.start).toHaveBeenCalled();
  });

  it('skips nodes with duplicate tokens', async () => {
    const { createChannelForNode } = await import('../channel-factory.js');
    const { vaultGet } = await import('../security/vault-key.js');
    (vaultGet as ReturnType<typeof vi.fn>).mockResolvedValue('same-token');

    const mockChannel = {
      name: 'telegram',
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn(),
      sendAlert: vi.fn(),
      sendMessage: vi.fn(),
      sendToGroup: vi.fn(),
    };
    (createChannelForNode as ReturnType<typeof vi.fn>).mockResolvedValue(mockChannel);

    const graph = makeGraph([
      { id: 'node-1', platform: 'telegram', status: 'connected' },
      { id: 'node-2', platform: 'telegram', status: 'connected' },
    ]);
    const deps = {
      db: {} as never,
      router: {} as never,
      audit: {} as never,
      config: { orchestrator: { routingCacheTtlMs: 5000, maxMessagesPerSecond: 10 } } as never,
    };

    const result = await setupOrchestrator(graph, deps, {} as never);

    // Only one channel should be created due to duplicate token
    expect(result!.startedChannels).toHaveLength(1);
  });

  it('handles channel start error gracefully', async () => {
    const { createChannelForNode } = await import('../channel-factory.js');
    const { vaultGet } = await import('../security/vault-key.js');
    (vaultGet as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const mockChannel = {
      name: 'telegram',
      start: vi.fn().mockRejectedValue(new Error('start failed')),
      stop: vi.fn(),
      sendAlert: vi.fn(),
      sendMessage: vi.fn(),
      sendToGroup: vi.fn(),
    };
    (createChannelForNode as ReturnType<typeof vi.fn>).mockResolvedValue(mockChannel);

    const graph = makeGraph([{ id: 'node-1', platform: 'telegram', status: 'connected' }]);
    const deps = {
      db: {} as never,
      router: {} as never,
      audit: {} as never,
      config: { orchestrator: { routingCacheTtlMs: 5000, maxMessagesPerSecond: 10 } } as never,
    };

    const result = await setupOrchestrator(graph, deps, {} as never);

    // Should still return the bundle even if start fails
    expect(result).not.toBeNull();
  });

  it('passes onActivity and integrationRegistry to orchestrator', async () => {
    const { createChannelForNode } = await import('../channel-factory.js');
    const { vaultGet } = await import('../security/vault-key.js');
    (vaultGet as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const mockChannel = {
      name: 'telegram',
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn(),
      sendAlert: vi.fn(),
      sendMessage: vi.fn(),
      sendToGroup: vi.fn(),
    };
    (createChannelForNode as ReturnType<typeof vi.fn>).mockResolvedValue(mockChannel);

    const graph = makeGraph([{ id: 'node-1', platform: 'telegram', status: 'connected' }]);
    const deps = {
      db: {} as never,
      router: {} as never,
      audit: {} as never,
      config: { orchestrator: { routingCacheTtlMs: 5000, maxMessagesPerSecond: 10 } } as never,
    };
    const onActivity = vi.fn();
    const integrationRegistry = {} as never;

    const result = await setupOrchestrator(graph, deps, {} as never, onActivity, integrationRegistry);

    expect(result).not.toBeNull();
  });

  it('filters out disconnected nodes', async () => {
    const graph = makeGraph([
      { id: 'node-1', platform: 'telegram', status: 'connected' },
      { id: 'node-2', platform: 'telegram', status: 'disconnected' },
    ]);
    const deps = {
      db: {} as never,
      router: {} as never,
      audit: {} as never,
      config: { orchestrator: { routingCacheTtlMs: 5000, maxMessagesPerSecond: 10 } } as never,
    };

    // createChannelForNode returns null, so bundle will be null
    // but we verify that only connected non-owner nodes are processed
    await setupOrchestrator(graph, deps, {} as never);

    const { createChannelForNode } = await import('../channel-factory.js');
    // Only called for the connected node
    expect(createChannelForNode).toHaveBeenCalledTimes(1);
  });
});
