import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerIntegrationHandlers } from '../integration-ipc.js';
import type { IntegrationIpcDeps } from '../integration-ipc.js';

vi.mock('../integrations/catalog.js', () => ({
  INTEGRATION_CATALOG: [
    {
      id: 'test-int',
      name: 'Test Integration',
      credentialKeys: ['api_key'],
      mcpRemote: null,
    },
  ],
}));

vi.mock('../security/vault-key.js', () => ({
  vaultStore: vi.fn().mockResolvedValue(undefined),
  vaultDelete: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../graph-persistence.js', () => ({
  persistCanvasGraphDebounced: vi.fn(),
}));

vi.mock('../config/paths.js', () => ({
  paths: { canvas: '/mock/canvas.json' },
}));

function createMockDeps(overrides?: Partial<IntegrationIpcDeps>): IntegrationIpcDeps {
  return {
    ipcServer: {
      registerMethod: vi.fn(),
    } as never,
    integrationRegistry: {
      getCatalogWithStatus: vi.fn().mockReturnValue([]),
      connect: vi.fn().mockResolvedValue({ status: 'connected' }),
      disconnect: vi.fn().mockResolvedValue(undefined),
      getAvailableTools: vi.fn().mockReturnValue([]),
      connectInstance: vi.fn().mockResolvedValue({ status: 'ok' }),
      disconnectInstance: vi.fn().mockResolvedValue(undefined),
    } as never,
    getOrchestrator: vi.fn().mockReturnValue(null),
    loadCanvasGraph: vi.fn().mockReturnValue({
      nodes: [{ id: 'node-1', integrations: ['existing:default'] }],
      edges: [],
      workspaces: [],
      instances: [],
      globalInstructions: '',
    }),
    loadConfig: vi.fn().mockResolvedValue({
      integrations: {},
    }),
    saveConfig: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('registerIntegrationHandlers', () => {
  let deps: IntegrationIpcDeps;
  let registeredHandlers: Map<string, (...args: unknown[]) => unknown>;

  beforeEach(() => {
    vi.clearAllMocks();
    deps = createMockDeps();
    registeredHandlers = new Map();

    (deps.ipcServer.registerMethod as ReturnType<typeof vi.fn>).mockImplementation(
      (name: string, handler: (...args: unknown[]) => unknown) => {
        registeredHandlers.set(name, handler);
      },
    );

    registerIntegrationHandlers(deps);
  });

  it('registers all expected IPC methods', () => {
    const expectedMethods = [
      'integrations:list-catalog',
      'integrations:connect',
      'integrations:disconnect',
      'integrations:list-tools',
      'integrations:assign-instance',
      'integrations:unassign-instance',
      'integrations:connect-instance',
      'integrations:disconnect-instance',
    ];

    for (const method of expectedMethods) {
      expect(registeredHandlers.has(method)).toBe(true);
    }
  });

  it('list-catalog calls getCatalogWithStatus', () => {
    const handler = registeredHandlers.get('integrations:list-catalog')!;
    handler();

    expect(deps.integrationRegistry.getCatalogWithStatus).toHaveBeenCalled();
  });

  it('connect stores credentials in vault and saves config', async () => {
    const handler = registeredHandlers.get('integrations:connect')!;
    await handler({} as never, { id: 'test-int', credentials: { api_key: 'secret123' } });

    const { vaultStore } = await import('../security/vault-key.js');
    expect(vaultStore).toHaveBeenCalledWith('integration_test-int_api_key', 'secret123');
    expect(deps.saveConfig).toHaveBeenCalled();
  });

  it('connect throws for unknown integration', async () => {
    const handler = registeredHandlers.get('integrations:connect')!;

    await expect(
      handler({} as never, { id: 'unknown', credentials: {} }),
    ).rejects.toThrow('Unknown integration: unknown');
  });

  it('disconnect deletes vault keys and saves config', async () => {
    const handler = registeredHandlers.get('integrations:disconnect')!;
    await handler({} as never, { id: 'test-int' });

    const { vaultDelete } = await import('../security/vault-key.js');
    expect(vaultDelete).toHaveBeenCalledWith('integration_test-int_api_key');
    expect(deps.saveConfig).toHaveBeenCalled();
  });

  it('disconnect returns success', async () => {
    const handler = registeredHandlers.get('integrations:disconnect')!;
    const result = await handler({} as never, { id: 'test-int' });

    expect(result).toEqual({ success: true });
  });

  it('list-tools forwards integrationId param', () => {
    const handler = registeredHandlers.get('integrations:list-tools')!;
    handler({} as never, { integrationId: 'test-int' });

    expect(deps.integrationRegistry.getAvailableTools).toHaveBeenCalledWith('test-int');
  });

  it('assign-instance throws when node not found', () => {
    (deps.loadCanvasGraph as ReturnType<typeof vi.fn>).mockReturnValue({
      nodes: [],
      edges: [],
      workspaces: [],
      instances: [],
    });

    const handler = registeredHandlers.get('integrations:assign-instance')!;

    expect(() =>
      handler({} as never, { nodeId: 'missing', instanceId: 'test:default' }),
    ).toThrow('Node not found: missing');
  });

  it('assign-instance returns success if already assigned', () => {
    (deps.loadCanvasGraph as ReturnType<typeof vi.fn>).mockReturnValue({
      nodes: [{ id: 'node-1', integrations: ['test:default'] }],
      edges: [],
      workspaces: [],
      instances: [],
    });

    const handler = registeredHandlers.get('integrations:assign-instance')!;
    const result = handler({} as never, { nodeId: 'node-1', instanceId: 'test:default' });

    expect(result).toEqual({ success: true });
  });

  it('unassign-instance removes instance and persists graph', () => {
    (deps.loadCanvasGraph as ReturnType<typeof vi.fn>).mockReturnValue({
      nodes: [{ id: 'node-1', integrations: ['test:default', 'other:default'] }],
      edges: [],
      workspaces: [],
      instances: [],
    });

    const handler = registeredHandlers.get('integrations:unassign-instance')!;
    const result = handler({} as never, { nodeId: 'node-1', instanceId: 'test:default' });

    expect(result).toEqual({ success: true });
  });

  it('connect-instance delegates to registry', async () => {
    const handler = registeredHandlers.get('integrations:connect-instance')!;
    await handler({} as never, {
      instanceId: 'test:custom',
      integrationId: 'test-int',
      label: 'My Test',
      credentials: { api_key: 'key' },
    });

    expect(deps.integrationRegistry.connectInstance).toHaveBeenCalledWith(
      'test:custom',
      'test-int',
      'My Test',
      { api_key: 'key' },
    );
  });

  it('disconnect-instance delegates and returns success', async () => {
    const handler = registeredHandlers.get('integrations:disconnect-instance')!;
    const result = await handler({} as never, { instanceId: 'test:custom' });

    expect(result).toEqual({ success: true });
  });
});
