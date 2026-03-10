import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DaemonContext } from '../daemon-lifecycle.js';
import { stopDaemonContext, startDaemonContext } from '../daemon-lifecycle.js';

const mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

vi.mock('../utils/logger.js', () => ({
  getLogger: () => mockLogger,
}));

vi.mock('../db/connection.js', () => ({
  openDatabase: vi.fn(() => ({ pragma: vi.fn() })),
  closeDatabase: vi.fn(),
}));

vi.mock('../db/schema.js', () => ({
  applySchema: vi.fn(),
}));

vi.mock('../db/migrations.js', () => ({
  runMigrations: vi.fn(),
}));

vi.mock('../config/loader.js', () => ({
  ensureConfigDir: vi.fn().mockResolvedValue(undefined),
  loadConfig: vi.fn().mockResolvedValue({
    mcp: { servers: {} },
    budget: { dailyLimitUsd: 10 },
  }),
  saveConfig: vi.fn(),
}));

vi.mock('../config/paths.js', () => ({
  paths: { home: '/mock/home', socket: '/mock/socket' },
}));

vi.mock('../security/audit.js', () => {
  const AuditLogger = vi.fn(function (this: { logAction: ReturnType<typeof vi.fn> }) {
    this.logAction = vi.fn();
  });
  return { AuditLogger };
});

vi.mock('../security/startup-checks.js', () => ({
  runSecurityChecks: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../ai/router.js', () => {
  const ModelRouter = vi.fn(function (this: { onCostIncurred: ReturnType<typeof vi.fn> }) {
    this.onCostIncurred = vi.fn();
  });
  return { ModelRouter };
});

vi.mock('../auth/resolve.js', () => ({
  resolveApiKey: vi.fn().mockResolvedValue('mock-key'),
}));

vi.mock('../auth/oauth.js', () => ({
  refreshOAuthTokenIfNeeded: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../mcp/client.js', () => {
  const McpClientManager = vi.fn(function (this: {
    startHealthMonitor: ReturnType<typeof vi.fn>;
    stopHealthMonitor: ReturnType<typeof vi.fn>;
    disconnectAll: ReturnType<typeof vi.fn>;
  }) {
    this.startHealthMonitor = vi.fn();
    this.stopHealthMonitor = vi.fn();
    this.disconnectAll = vi.fn().mockResolvedValue(undefined);
  });
  return { McpClientManager };
});

vi.mock('../engine/proactive.js', () => {
  const ProactiveEngine = vi.fn(function (this: { stop: ReturnType<typeof vi.fn> }) {
    this.stop = vi.fn();
  });
  return { ProactiveEngine };
});

vi.mock('../mcp/server.js', () => ({
  startMcpServer: vi.fn().mockResolvedValue({}),
}));

vi.mock('../daemon-ipc.js', () => ({
  startIpcServer: vi.fn().mockResolvedValue({
    broadcast: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('../orchestrator/checkpoint.js', () => {
  const CheckpointManager = vi.fn(function () {
    // empty
  });
  return { CheckpointManager };
});

vi.mock('../integrations/registry.js', () => {
  const IntegrationRegistry = vi.fn(function (this: { disconnectAll: ReturnType<typeof vi.fn> }) {
    this.disconnectAll = vi.fn().mockResolvedValue(undefined);
  });
  return { IntegrationRegistry };
});

vi.mock('../integrations/catalog.js', () => ({
  INTEGRATION_CATALOG: [],
}));

vi.mock('../integrations/token-refresh.js', () => {
  const TokenRefreshService = vi.fn(function (this: {
    scheduleRefresh: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
  }) {
    this.scheduleRefresh = vi.fn();
    this.stop = vi.fn();
  });
  return { TokenRefreshService };
});

vi.mock('../pid-lock.js', () => ({
  acquirePidLock: vi.fn(),
  releasePidLock: vi.fn(),
}));

vi.mock('../graph-loader.js', () => ({
  loadCanvasGraph: vi.fn(() => ({
    nodes: [],
    edges: [],
    workspaces: [],
  })),
}));

vi.mock('../orchestrator-setup.js', () => ({
  connectMcpSources: vi.fn().mockResolvedValue(undefined),
  autoConnectIntegrations: vi.fn().mockResolvedValue(undefined),
  setupOrchestrator: vi.fn().mockResolvedValue(null),
}));

vi.mock('../integration-ipc.js', () => ({
  registerIntegrationHandlers: vi.fn(),
}));

vi.mock('../daemon-watchers.js', () => ({
  setupCanvasWatcher: vi.fn(() => null),
  setupOwnerCommandWatcher: vi.fn(() => null),
}));

vi.mock('../security/vault-key.js', () => ({
  vaultGet: vi.fn().mockResolvedValue(null),
}));

vi.mock('../utils/budget.js', () => ({
  recordSpend: vi.fn(),
  isOverBudget: vi.fn(() => false),
}));

function createMockContext(overrides?: Partial<DaemonContext>): DaemonContext {
  return {
    db: {} as never,
    config: {} as never,
    audit: { logAction: vi.fn() } as never,
    router: {} as never,
    mcpClients: {
      stopHealthMonitor: vi.fn(),
      disconnectAll: vi.fn().mockResolvedValue(undefined),
    } as never,
    engine: { stop: vi.fn() } as never,
    mcpServer: {} as never,
    refreshInterval: setInterval(() => {}, 999_999),
    registry: null,
    orchestrator: null,
    queue: null,
    ipcServer: { close: vi.fn().mockResolvedValue(undefined) } as never,
    integrationRegistry: {
      disconnectAll: vi.fn().mockResolvedValue(undefined),
    } as never,
    tokenRefreshService: { stop: vi.fn() } as never,
    canvasWatcher: null,
    ownerCommandWatcher: null,
    ...overrides,
  };
}

describe('stopDaemonContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('clears the refresh interval', async () => {
    const spy = vi.spyOn(globalThis, 'clearInterval');
    const ctx = createMockContext();
    await stopDaemonContext(ctx);

    expect(spy).toHaveBeenCalledWith(ctx.refreshInterval);
    spy.mockRestore();
  });

  it('closes owner command watcher when present', async () => {
    const close = vi.fn();
    const ctx = createMockContext({ ownerCommandWatcher: { close } as never });
    await stopDaemonContext(ctx);

    expect(close).toHaveBeenCalled();
  });

  it('closes canvas watcher when present', async () => {
    const close = vi.fn();
    const ctx = createMockContext({ canvasWatcher: { close } as never });
    await stopDaemonContext(ctx);

    expect(close).toHaveBeenCalled();
  });

  it('gracefully stops the message queue when present', async () => {
    const gracefulStop = vi.fn().mockResolvedValue(undefined);
    const ctx = createMockContext({ queue: { gracefulStop } as never });
    await stopDaemonContext(ctx);

    expect(gracefulStop).toHaveBeenCalledWith(5000);
  });

  it('stops all registry channels when present', async () => {
    const stopAll = vi.fn().mockResolvedValue(undefined);
    const ctx = createMockContext({ registry: { stopAll } as never });
    await stopDaemonContext(ctx);

    expect(stopAll).toHaveBeenCalled();
  });

  it('stops proactive engine', async () => {
    const ctx = createMockContext();
    await stopDaemonContext(ctx);

    expect(ctx.engine.stop).toHaveBeenCalled();
  });

  it('stops token refresh service', async () => {
    const ctx = createMockContext();
    await stopDaemonContext(ctx);

    expect(ctx.tokenRefreshService.stop).toHaveBeenCalled();
  });

  it('disconnects integrations and MCP clients', async () => {
    const ctx = createMockContext();
    await stopDaemonContext(ctx);

    expect(ctx.integrationRegistry.disconnectAll).toHaveBeenCalled();
    expect(ctx.mcpClients.stopHealthMonitor).toHaveBeenCalled();
    expect(ctx.mcpClients.disconnectAll).toHaveBeenCalled();
  });

  it('closes IPC server', async () => {
    const ctx = createMockContext();
    await stopDaemonContext(ctx);

    expect(ctx.ipcServer.close).toHaveBeenCalled();
  });

  it('logs daemon:stop audit action', async () => {
    const ctx = createMockContext();
    await stopDaemonContext(ctx);

    expect(ctx.audit.logAction).toHaveBeenCalledWith('daemon:stop', {});
  });

  it('closes the database', async () => {
    const { closeDatabase } = await import('../db/connection.js');
    const ctx = createMockContext();
    await stopDaemonContext(ctx);

    expect(closeDatabase).toHaveBeenCalledWith(ctx.db);
  });

  it('releases the PID lock', async () => {
    const { releasePidLock } = await import('../pid-lock.js');
    const ctx = createMockContext();
    await stopDaemonContext(ctx);

    expect(releasePidLock).toHaveBeenCalled();
  });

  it('skips optional teardown when null', async () => {
    const ctx = createMockContext({
      registry: null,
      queue: null,
      canvasWatcher: null,
      ownerCommandWatcher: null,
    });

    await expect(stopDaemonContext(ctx)).resolves.toBeUndefined();
  });
});

describe('additional coverage — stopDaemonContext ordering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls teardown in correct order (watchers, queue, registry, engine, integrations, ipc, db)', async () => {
    const callOrder: string[] = [];
    const ctx = createMockContext({
      ownerCommandWatcher: {
        close: vi.fn(() => callOrder.push('ownerCommandWatcher')),
      } as never,
      canvasWatcher: {
        close: vi.fn(() => callOrder.push('canvasWatcher')),
      } as never,
      queue: {
        gracefulStop: vi.fn(async () => callOrder.push('queue')),
      } as never,
      registry: {
        stopAll: vi.fn(async () => callOrder.push('registry')),
      } as never,
      engine: {
        stop: vi.fn(() => callOrder.push('engine')),
      } as never,
      tokenRefreshService: {
        stop: vi.fn(() => callOrder.push('tokenRefresh')),
      } as never,
      integrationRegistry: {
        disconnectAll: vi.fn(async () => callOrder.push('integrations')),
      } as never,
      mcpClients: {
        stopHealthMonitor: vi.fn(() => callOrder.push('healthMonitor')),
        disconnectAll: vi.fn(async () => callOrder.push('mcpClients')),
      } as never,
      ipcServer: {
        close: vi.fn(async () => callOrder.push('ipcServer')),
      } as never,
    });

    await stopDaemonContext(ctx);

    expect(callOrder.indexOf('ownerCommandWatcher')).toBeLessThan(callOrder.indexOf('queue'));
    expect(callOrder.indexOf('canvasWatcher')).toBeLessThan(callOrder.indexOf('queue'));
    expect(callOrder.indexOf('queue')).toBeLessThan(callOrder.indexOf('registry'));
    expect(callOrder.indexOf('registry')).toBeLessThan(callOrder.indexOf('engine'));
    expect(callOrder.indexOf('engine')).toBeLessThan(callOrder.indexOf('integrations'));
    expect(callOrder.indexOf('integrations')).toBeLessThan(callOrder.indexOf('ipcServer'));
  });

  it('handles all optional fields being present', async () => {
    const ctx = createMockContext({
      ownerCommandWatcher: { close: vi.fn() } as never,
      canvasWatcher: { close: vi.fn() } as never,
      queue: { gracefulStop: vi.fn().mockResolvedValue(undefined) } as never,
      registry: { stopAll: vi.fn().mockResolvedValue(undefined) } as never,
    });

    await expect(stopDaemonContext(ctx)).resolves.toBeUndefined();
  });

  it('handles all optional fields being null', async () => {
    const ctx = createMockContext({
      ownerCommandWatcher: null,
      canvasWatcher: null,
      queue: null,
      registry: null,
    });

    await expect(stopDaemonContext(ctx)).resolves.toBeUndefined();
  });
});

describe('startDaemonContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a DaemonContext with all required fields', async () => {
    const ctx = await startDaemonContext();

    expect(ctx.db).toBeDefined();
    expect(ctx.config).toBeDefined();
    expect(ctx.audit).toBeDefined();
    expect(ctx.router).toBeDefined();
    expect(ctx.mcpClients).toBeDefined();
    expect(ctx.engine).toBeDefined();
    expect(ctx.mcpServer).toBeDefined();
    expect(ctx.refreshInterval).toBeDefined();
    expect(ctx.ipcServer).toBeDefined();
    expect(ctx.integrationRegistry).toBeDefined();
    expect(ctx.tokenRefreshService).toBeDefined();

    clearInterval(ctx.refreshInterval);
  });

  it('acquires PID lock on startup', async () => {
    const { acquirePidLock } = await import('../pid-lock.js');
    const ctx = await startDaemonContext();

    expect(acquirePidLock).toHaveBeenCalled();
    clearInterval(ctx.refreshInterval);
  });

  it('runs security checks', async () => {
    const { runSecurityChecks } = await import('../security/startup-checks.js');
    const ctx = await startDaemonContext();

    expect(runSecurityChecks).toHaveBeenCalled();
    clearInterval(ctx.refreshInterval);
  });

  it('opens database and applies schema + migrations', async () => {
    const { openDatabase } = await import('../db/connection.js');
    const { applySchema } = await import('../db/schema.js');
    const { runMigrations } = await import('../db/migrations.js');

    const ctx = await startDaemonContext();

    expect(openDatabase).toHaveBeenCalled();
    expect(applySchema).toHaveBeenCalled();
    expect(runMigrations).toHaveBeenCalled();
    clearInterval(ctx.refreshInterval);
  });

  it('loads config after ensuring config dir', async () => {
    const { ensureConfigDir, loadConfig } = await import('../config/loader.js');
    const ctx = await startDaemonContext();

    expect(ensureConfigDir).toHaveBeenCalled();
    expect(loadConfig).toHaveBeenCalled();
    clearInterval(ctx.refreshInterval);
  });

  it('connects MCP sources and starts health monitor', async () => {
    const { connectMcpSources } = await import('../orchestrator-setup.js');
    const ctx = await startDaemonContext();

    expect(connectMcpSources).toHaveBeenCalled();
    expect(ctx.mcpClients.startHealthMonitor).toHaveBeenCalled();
    clearInterval(ctx.refreshInterval);
  });

  it('auto-connects integrations', async () => {
    const { autoConnectIntegrations } = await import('../orchestrator-setup.js');
    const ctx = await startDaemonContext();

    expect(autoConnectIntegrations).toHaveBeenCalled();
    clearInterval(ctx.refreshInterval);
  });

  it('calls setupOrchestrator with the canvas graph', async () => {
    const { setupOrchestrator } = await import('../orchestrator-setup.js');
    const ctx = await startDaemonContext();

    expect(setupOrchestrator).toHaveBeenCalled();
    clearInterval(ctx.refreshInterval);
  });

  it('sets registry/orchestrator/queue to null when setupOrchestrator returns null', async () => {
    const ctx = await startDaemonContext();

    expect(ctx.registry).toBeNull();
    expect(ctx.orchestrator).toBeNull();
    expect(ctx.queue).toBeNull();
    clearInterval(ctx.refreshInterval);
  });

  it('extracts bundle fields when setupOrchestrator returns a bundle', async () => {
    const { setupOrchestrator } = await import('../orchestrator-setup.js');
    const mockBundle = {
      registry: { stopAll: vi.fn() },
      orchestrator: { handleInbound: vi.fn() },
      queue: { gracefulStop: vi.fn() },
      startedChannels: [{ nodeId: 'n1', channel: {} }],
    };
    vi.mocked(setupOrchestrator).mockResolvedValueOnce(mockBundle as never);

    const ctx = await startDaemonContext();

    expect(ctx.registry).toBe(mockBundle.registry);
    expect(ctx.orchestrator).toBe(mockBundle.orchestrator);
    expect(ctx.queue).toBe(mockBundle.queue);
    clearInterval(ctx.refreshInterval);
  });

  it('logs orchestrator info when bundle is present', async () => {
    const { setupOrchestrator } = await import('../orchestrator-setup.js');
    const { loadCanvasGraph } = await import('../graph-loader.js');
    vi.mocked(loadCanvasGraph).mockReturnValueOnce({
      nodes: [{ id: 'n1' }, { id: 'n2' }],
      edges: [{ id: 'e1', from: 'n1', to: 'n2' }],
      workspaces: [],
    } as never);
    vi.mocked(setupOrchestrator).mockResolvedValueOnce({
      registry: { stopAll: vi.fn() },
      orchestrator: {},
      queue: {},
      startedChannels: [{ nodeId: 'n1', channel: {} }],
    } as never);

    const ctx = await startDaemonContext();

    expect(mockLogger.info).toHaveBeenCalledWith('Orchestrator started', {
      channels: 1,
      nodes: 2,
      edges: 1,
    });
    clearInterval(ctx.refreshInterval);
  });

  it('registers integration handlers', async () => {
    const { registerIntegrationHandlers } = await import('../integration-ipc.js');
    const ctx = await startDaemonContext();

    expect(registerIntegrationHandlers).toHaveBeenCalled();
    clearInterval(ctx.refreshInterval);
  });

  it('starts IPC server with socket path', async () => {
    const { startIpcServer } = await import('../daemon-ipc.js');
    const ctx = await startDaemonContext();

    expect(startIpcServer).toHaveBeenCalledWith(
      '/mock/socket',
      expect.anything(),
      expect.any(Number),
    );
    clearInterval(ctx.refreshInterval);
  });

  it('starts MCP server', async () => {
    const { startMcpServer } = await import('../mcp/server.js');
    const ctx = await startDaemonContext();

    expect(startMcpServer).toHaveBeenCalled();
    clearInterval(ctx.refreshInterval);
  });

  it('sets up canvas watcher and owner command watcher', async () => {
    const { setupCanvasWatcher, setupOwnerCommandWatcher } = await import('../daemon-watchers.js');
    const ctx = await startDaemonContext();

    expect(setupCanvasWatcher).toHaveBeenCalled();
    expect(setupOwnerCommandWatcher).toHaveBeenCalled();
    clearInterval(ctx.refreshInterval);
  });

  it('logs daemon:start audit action', async () => {
    const { AuditLogger } = await import('../security/audit.js');
    const mockLogAction = vi.fn();
    vi.mocked(AuditLogger).mockImplementationOnce(function (this: {
      logAction: typeof mockLogAction;
    }) {
      this.logAction = mockLogAction;
    } as never);

    const ctx = await startDaemonContext();

    expect(mockLogAction).toHaveBeenCalledWith('daemon:start', {
      mcpServers: [],
      orchestratorActive: false,
      orchestratorChannels: 0,
    });
    clearInterval(ctx.refreshInterval);
  });

  it('registers onCostIncurred callback on the router', async () => {
    const { ModelRouter } = await import('../ai/router.js');
    const mockOnCostIncurred = vi.fn();
    vi.mocked(ModelRouter).mockImplementationOnce(function (this: {
      onCostIncurred: typeof mockOnCostIncurred;
    }) {
      this.onCostIncurred = mockOnCostIncurred;
    } as never);

    const ctx = await startDaemonContext();

    expect(mockOnCostIncurred).toHaveBeenCalledWith(expect.any(Function));
    clearInterval(ctx.refreshInterval);
  });

  it('cost callback records spend and checks budget', async () => {
    const { ModelRouter } = await import('../ai/router.js');
    const { recordSpend, isOverBudget } = await import('../utils/budget.js');
    let capturedCallback: ((model: string, cost: number) => void) | undefined;
    vi.mocked(ModelRouter).mockImplementationOnce(function (this: {
      onCostIncurred: ReturnType<typeof vi.fn>;
    }) {
      this.onCostIncurred = vi.fn((cb: (model: string, cost: number) => void) => {
        capturedCallback = cb;
      });
    } as never);

    const ctx = await startDaemonContext();

    expect(capturedCallback).toBeDefined();
    capturedCallback!('claude-3', 0.05);
    expect(recordSpend).toHaveBeenCalledWith(expect.anything(), 0.05, 'claude-3');
    expect(isOverBudget).toHaveBeenCalledWith(expect.anything(), 10);
    clearInterval(ctx.refreshInterval);
  });

  it('cost callback logs warning when over budget', async () => {
    const { ModelRouter } = await import('../ai/router.js');
    const { isOverBudget } = await import('../utils/budget.js');
    let capturedCallback: ((model: string, cost: number) => void) | undefined;
    vi.mocked(ModelRouter).mockImplementationOnce(function (this: {
      onCostIncurred: ReturnType<typeof vi.fn>;
    }) {
      this.onCostIncurred = vi.fn((cb: (model: string, cost: number) => void) => {
        capturedCallback = cb;
      });
    } as never);
    vi.mocked(isOverBudget).mockReturnValue(true);

    const ctx = await startDaemonContext();

    capturedCallback!('claude-3', 0.05);
    expect(mockLogger.warn).toHaveBeenCalledWith('Daily budget limit reached', { limit: 10 });
    clearInterval(ctx.refreshInterval);
  });

  it('clears terminalActive flags on nodes at startup', async () => {
    const { loadCanvasGraph } = await import('../graph-loader.js');
    const { setupOrchestrator } = await import('../orchestrator-setup.js');
    vi.mocked(loadCanvasGraph).mockReturnValueOnce({
      nodes: [
        { id: 'n1', codeMode: { terminalActive: true } },
        { id: 'n2' },
        { id: 'n3', codeMode: { terminalActive: false } },
      ],
      edges: [],
      workspaces: [],
    } as never);

    const ctx = await startDaemonContext();

    const graphArg = vi.mocked(setupOrchestrator).mock.calls[0]?.[0] as unknown as {
      nodes: Array<{ id: string; codeMode?: { terminalActive: boolean } }>;
    };
    const n1 = graphArg.nodes.find((n) => n.id === 'n1');
    expect(n1?.codeMode?.terminalActive).toBe(false);
    const n2 = graphArg.nodes.find((n) => n.id === 'n2');
    expect(n2?.codeMode).toBeUndefined();
    clearInterval(ctx.refreshInterval);
  });

  it('schedules token refresh for catalog entries with OAuth credentials', async () => {
    const { INTEGRATION_CATALOG } = await import('../integrations/catalog.js');
    const { vaultGet } = await import('../security/vault-key.js');
    const { TokenRefreshService } = await import('../integrations/token-refresh.js');

    const mockScheduleRefresh = vi.fn();
    vi.mocked(TokenRefreshService).mockImplementationOnce(function (this: {
      scheduleRefresh: typeof mockScheduleRefresh;
      stop: ReturnType<typeof vi.fn>;
    }) {
      this.scheduleRefresh = mockScheduleRefresh;
      this.stop = vi.fn();
    } as never);

    // Replace catalog with a test entry that has mcpRemote
    const testCatalog = [
      {
        id: 'test-integration',
        mcpRemote: { url: 'https://example.com/mcp' },
      },
    ];
    (INTEGRATION_CATALOG as unknown as { length: number; [index: number]: unknown }).length = 0;
    Object.assign(INTEGRATION_CATALOG, testCatalog);

    vi.mocked(vaultGet).mockResolvedValueOnce(JSON.stringify({ expiresAt: Date.now() + 60_000 }));

    const ctx = await startDaemonContext();

    expect(mockScheduleRefresh).toHaveBeenCalledWith(
      'test-integration',
      'https://example.com/.well-known/oauth-authorization-server',
      expect.any(Number),
    );
    clearInterval(ctx.refreshInterval);

    // Restore catalog
    (INTEGRATION_CATALOG as unknown as { length: number }).length = 0;
  });

  it('skips catalog entries without mcpRemote', async () => {
    const { INTEGRATION_CATALOG } = await import('../integrations/catalog.js');
    const { vaultGet } = await import('../security/vault-key.js');
    const { TokenRefreshService } = await import('../integrations/token-refresh.js');

    const mockScheduleRefresh = vi.fn();
    vi.mocked(TokenRefreshService).mockImplementationOnce(function (this: {
      scheduleRefresh: typeof mockScheduleRefresh;
      stop: ReturnType<typeof vi.fn>;
    }) {
      this.scheduleRefresh = mockScheduleRefresh;
      this.stop = vi.fn();
    } as never);

    const testCatalog = [{ id: 'no-remote' }];
    (INTEGRATION_CATALOG as unknown as { length: number }).length = 0;
    Object.assign(INTEGRATION_CATALOG, testCatalog);

    const ctx = await startDaemonContext();

    expect(vaultGet).not.toHaveBeenCalled();
    expect(mockScheduleRefresh).not.toHaveBeenCalled();
    clearInterval(ctx.refreshInterval);

    (INTEGRATION_CATALOG as unknown as { length: number }).length = 0;
  });

  it('skips credentials without expiresAt', async () => {
    const { INTEGRATION_CATALOG } = await import('../integrations/catalog.js');
    const { vaultGet } = await import('../security/vault-key.js');
    const { TokenRefreshService } = await import('../integrations/token-refresh.js');

    const mockScheduleRefresh = vi.fn();
    vi.mocked(TokenRefreshService).mockImplementationOnce(function (this: {
      scheduleRefresh: typeof mockScheduleRefresh;
      stop: ReturnType<typeof vi.fn>;
    }) {
      this.scheduleRefresh = mockScheduleRefresh;
      this.stop = vi.fn();
    } as never);

    const testCatalog = [{ id: 'test', mcpRemote: { url: 'https://example.com/mcp' } }];
    (INTEGRATION_CATALOG as unknown as { length: number }).length = 0;
    Object.assign(INTEGRATION_CATALOG, testCatalog);

    vi.mocked(vaultGet).mockResolvedValueOnce(JSON.stringify({ token: 'abc' }));

    const ctx = await startDaemonContext();

    expect(mockScheduleRefresh).not.toHaveBeenCalled();
    clearInterval(ctx.refreshInterval);

    (INTEGRATION_CATALOG as unknown as { length: number }).length = 0;
  });

  it('ignores malformed credentials in vault', async () => {
    const { INTEGRATION_CATALOG } = await import('../integrations/catalog.js');
    const { vaultGet } = await import('../security/vault-key.js');
    const { TokenRefreshService } = await import('../integrations/token-refresh.js');

    const mockScheduleRefresh = vi.fn();
    vi.mocked(TokenRefreshService).mockImplementationOnce(function (this: {
      scheduleRefresh: typeof mockScheduleRefresh;
      stop: ReturnType<typeof vi.fn>;
    }) {
      this.scheduleRefresh = mockScheduleRefresh;
      this.stop = vi.fn();
    } as never);

    const testCatalog = [{ id: 'test', mcpRemote: { url: 'https://example.com/mcp' } }];
    (INTEGRATION_CATALOG as unknown as { length: number }).length = 0;
    Object.assign(INTEGRATION_CATALOG, testCatalog);

    vi.mocked(vaultGet).mockResolvedValueOnce('not-valid-json{{{');

    const ctx = await startDaemonContext();

    expect(mockScheduleRefresh).not.toHaveBeenCalled();
    clearInterval(ctx.refreshInterval);

    (INTEGRATION_CATALOG as unknown as { length: number }).length = 0;
  });

  it('strips /mcp, /sse, and trailing slash from mcpRemote url for token endpoint', async () => {
    const { INTEGRATION_CATALOG } = await import('../integrations/catalog.js');
    const { vaultGet } = await import('../security/vault-key.js');
    const { TokenRefreshService } = await import('../integrations/token-refresh.js');

    const mockScheduleRefresh = vi.fn();
    vi.mocked(TokenRefreshService).mockImplementationOnce(function (this: {
      scheduleRefresh: typeof mockScheduleRefresh;
      stop: ReturnType<typeof vi.fn>;
    }) {
      this.scheduleRefresh = mockScheduleRefresh;
      this.stop = vi.fn();
    } as never);

    const testCatalog = [{ id: 'test', mcpRemote: { url: 'https://api.example.com/sse' } }];
    (INTEGRATION_CATALOG as unknown as { length: number }).length = 0;
    Object.assign(INTEGRATION_CATALOG, testCatalog);

    vi.mocked(vaultGet).mockResolvedValueOnce(JSON.stringify({ expiresAt: 99999999999 }));

    const ctx = await startDaemonContext();

    expect(mockScheduleRefresh).toHaveBeenCalledWith(
      'test',
      'https://api.example.com/.well-known/oauth-authorization-server',
      99999999999,
    );
    clearInterval(ctx.refreshInterval);

    (INTEGRATION_CATALOG as unknown as { length: number }).length = 0;
  });

  it('creates ProactiveEngine in owner-driven mode', async () => {
    const { ProactiveEngine } = await import('../engine/proactive.js');
    const ctx = await startDaemonContext();

    expect(ProactiveEngine).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.any(Function),
    );
    clearInterval(ctx.refreshInterval);
  });

  it('sets up refresh interval for OAuth token', async () => {
    const spy = vi.spyOn(globalThis, 'setInterval');
    const ctx = await startDaemonContext();

    const matchingCall = spy.mock.calls.find((c) => c[1] === 1_800_000);
    expect(matchingCall).toBeDefined();
    clearInterval(ctx.refreshInterval);
    spy.mockRestore();
  });
});
