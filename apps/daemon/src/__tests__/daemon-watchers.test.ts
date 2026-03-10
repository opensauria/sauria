import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CanvasWatcherDeps } from '../daemon-watchers.js';

vi.mock('../utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

const mockWatch = vi.fn();
const mockExistsSync = vi.fn();
const mockReadFileSync = vi.fn();
const mockWriteFileSync = vi.fn();

vi.mock('node:fs', () => ({
  watch: (...args: unknown[]) => mockWatch(...args),
  existsSync: (...args: unknown[]) => mockExistsSync(...args),
  readFileSync: (...args: unknown[]) => mockReadFileSync(...args),
  writeFileSync: (...args: unknown[]) => mockWriteFileSync(...args),
}));

vi.mock('../config/paths.js', () => ({
  paths: {
    canvas: '/mock/canvas.json',
    ownerCommands: '/mock/owner-commands.jsonl',
  },
}));

vi.mock('../graph-loader.js', () => ({
  loadCanvasGraph: vi.fn().mockReturnValue({ nodes: [], edges: [], workspaces: [] }),
}));

vi.mock('../channel-factory.js', () => ({
  createChannelForNode: vi.fn().mockResolvedValue(null),
}));

describe('setupCanvasWatcher', () => {
  let setupCanvasWatcher: typeof import('../daemon-watchers.js').setupCanvasWatcher;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../daemon-watchers.js');
    setupCanvasWatcher = mod.setupCanvasWatcher;
  });

  it('returns null when watch throws (file does not exist)', () => {
    mockWatch.mockImplementation(() => {
      throw new Error('ENOENT');
    });

    const deps: CanvasWatcherDeps = {
      orchestrator: null,
      registry: null,
      queue: null,
      db: {} as never,
      router: {} as never,
      audit: {} as never,
      config: {} as never,
      globalInstructions: '',
    };

    const result = setupCanvasWatcher(deps);
    expect(result).toBeNull();
  });

  it('returns a watcher object on success', () => {
    const fakeWatcher = { close: vi.fn() };
    mockWatch.mockReturnValue(fakeWatcher);

    const deps: CanvasWatcherDeps = {
      orchestrator: null,
      registry: null,
      queue: null,
      db: {} as never,
      router: {} as never,
      audit: {} as never,
      config: {} as never,
      globalInstructions: '',
    };

    const result = setupCanvasWatcher(deps);
    expect(result).toBe(fakeWatcher);
  });
});

describe('setupOwnerCommandWatcher', () => {
  let setupOwnerCommandWatcher: typeof import('../daemon-watchers.js').setupOwnerCommandWatcher;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../daemon-watchers.js');
    setupOwnerCommandWatcher = mod.setupOwnerCommandWatcher;
  });

  it('returns null when orchestrator is null', () => {
    const result = setupOwnerCommandWatcher(null, {} as never);
    expect(result).toBeNull();
  });

  it('creates the command file if it does not exist', () => {
    mockExistsSync.mockReturnValue(false);
    const fakeWatcher = { close: vi.fn() };
    mockWatch.mockReturnValue(fakeWatcher);

    const orchestrator = { handleOwnerCommand: vi.fn() } as never;
    const audit = { logAction: vi.fn() } as never;

    setupOwnerCommandWatcher(orchestrator, audit);

    expect(mockWriteFileSync).toHaveBeenCalledWith('/mock/owner-commands.jsonl', '', 'utf-8');
  });

  it('returns a watcher on success', () => {
    mockExistsSync.mockReturnValue(true);
    const fakeWatcher = { close: vi.fn() };
    mockWatch.mockReturnValue(fakeWatcher);

    const orchestrator = { handleOwnerCommand: vi.fn() } as never;
    const audit = { logAction: vi.fn() } as never;

    const result = setupOwnerCommandWatcher(orchestrator, audit);
    expect(result).toBe(fakeWatcher);
  });

  it('returns null when watch throws', () => {
    mockExistsSync.mockReturnValue(true);
    mockWatch.mockImplementation(() => {
      throw new Error('EACCES');
    });

    const orchestrator = { handleOwnerCommand: vi.fn() } as never;
    const audit = { logAction: vi.fn() } as never;

    const result = setupOwnerCommandWatcher(orchestrator, audit);
    expect(result).toBeNull();
  });
});

describe('additional coverage — setupCanvasWatcher reload logic', () => {
  let setupCanvasWatcher: typeof import('../daemon-watchers.js').setupCanvasWatcher;
  let loadCanvasGraph: ReturnType<typeof vi.fn>;
  let createChannelForNode: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const graphMod = await import('../graph-loader.js');
    loadCanvasGraph = graphMod.loadCanvasGraph as ReturnType<typeof vi.fn>;
    const factoryMod = await import('../channel-factory.js');
    createChannelForNode = factoryMod.createChannelForNode as ReturnType<typeof vi.fn>;
    const mod = await import('../daemon-watchers.js');
    setupCanvasWatcher = mod.setupCanvasWatcher;
  });

  function triggerWatchCallback(): void {
    const cb = mockWatch.mock.calls[0]?.[2] as (() => void) | undefined;
    if (cb) cb();
  }

  it('reloads canvas and updates orchestrator graph when orchestrator + registry present', async () => {
    const fakeWatcher = { close: vi.fn() };
    mockWatch.mockReturnValue(fakeWatcher);

    loadCanvasGraph.mockReturnValue({
      nodes: [],
      edges: [],
      workspaces: [],
      globalInstructions: '',
    });

    const updateGraph = vi.fn();
    const orchestrator = { updateGraph } as never;
    const registry = {
      getAll: vi.fn().mockReturnValue([]),
      stop: vi.fn().mockResolvedValue(undefined),
      unregister: vi.fn(),
      register: vi.fn(),
    } as never;
    const queue = { enqueue: vi.fn() } as never;

    const deps: import('../daemon-watchers.js').CanvasWatcherDeps = {
      orchestrator,
      registry,
      queue,
      db: {} as never,
      router: {} as never,
      audit: {} as never,
      config: {} as never,
      globalInstructions: '',
    };

    setupCanvasWatcher(deps);
    triggerWatchCallback();

    // Wait for debounce (100ms)
    await new Promise((r) => setTimeout(r, 150));

    expect(updateGraph).toHaveBeenCalled();
  });

  it('removes channels no longer in canvas graph', async () => {
    const fakeWatcher = { close: vi.fn() };
    mockWatch.mockReturnValue(fakeWatcher);

    loadCanvasGraph.mockReturnValue({
      nodes: [],
      edges: [],
      workspaces: [],
      globalInstructions: '',
    });

    const stopFn = vi.fn().mockResolvedValue(undefined);
    const unregisterFn = vi.fn();
    const registry = {
      getAll: vi.fn().mockReturnValue([{ nodeId: 'old-node', channel: {} }]),
      stop: stopFn,
      unregister: unregisterFn,
      register: vi.fn(),
    } as never;
    const updateGraph = vi.fn();
    const orchestrator = { updateGraph } as never;

    const deps: import('../daemon-watchers.js').CanvasWatcherDeps = {
      orchestrator,
      registry,
      queue: { enqueue: vi.fn() } as never,
      db: {} as never,
      router: {} as never,
      audit: {} as never,
      config: {} as never,
      globalInstructions: '',
    };

    setupCanvasWatcher(deps);
    triggerWatchCallback();

    await new Promise((r) => setTimeout(r, 150));

    expect(stopFn).toHaveBeenCalledWith('old-node');
    expect(unregisterFn).toHaveBeenCalledWith('old-node');
  });

  it('adds new channels from canvas graph', async () => {
    const fakeWatcher = { close: vi.fn() };
    mockWatch.mockReturnValue(fakeWatcher);

    const mockChannel = {
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
    };
    createChannelForNode.mockResolvedValue(mockChannel);

    loadCanvasGraph.mockReturnValue({
      nodes: [{ id: 'new-node', status: 'connected', platform: 'telegram', label: 'Test' }],
      edges: [],
      workspaces: [],
      globalInstructions: '',
    });

    const registerFn = vi.fn();
    const registry = {
      getAll: vi.fn().mockReturnValue([]),
      stop: vi.fn().mockResolvedValue(undefined),
      unregister: vi.fn(),
      register: registerFn,
    } as never;
    const updateGraph = vi.fn();
    const orchestrator = { updateGraph } as never;

    const deps: import('../daemon-watchers.js').CanvasWatcherDeps = {
      orchestrator,
      registry,
      queue: { enqueue: vi.fn() } as never,
      db: {} as never,
      router: {} as never,
      audit: {} as never,
      config: {} as never,
      globalInstructions: '',
    };

    setupCanvasWatcher(deps);
    triggerWatchCallback();

    await new Promise((r) => setTimeout(r, 150));

    expect(createChannelForNode).toHaveBeenCalled();
    expect(registerFn).toHaveBeenCalledWith('new-node', mockChannel);
    expect(mockChannel.start).toHaveBeenCalled();
  });

  it('skips owner nodes when finding connected nodes', async () => {
    const fakeWatcher = { close: vi.fn() };
    mockWatch.mockReturnValue(fakeWatcher);

    loadCanvasGraph.mockReturnValue({
      nodes: [{ id: 'owner-1', status: 'connected', platform: 'owner', label: 'Owner' }],
      edges: [],
      workspaces: [],
      globalInstructions: '',
    });

    const registry = {
      getAll: vi.fn().mockReturnValue([]),
      stop: vi.fn().mockResolvedValue(undefined),
      unregister: vi.fn(),
      register: vi.fn(),
    } as never;
    const updateGraph = vi.fn();
    const orchestrator = { updateGraph } as never;

    const deps: import('../daemon-watchers.js').CanvasWatcherDeps = {
      orchestrator,
      registry,
      queue: { enqueue: vi.fn() } as never,
      db: {} as never,
      router: {} as never,
      audit: {} as never,
      config: {} as never,
      globalInstructions: '',
    };

    setupCanvasWatcher(deps);
    triggerWatchCallback();

    await new Promise((r) => setTimeout(r, 150));

    expect(createChannelForNode).not.toHaveBeenCalled();
  });

  it('updates graph when orchestrator exists but no registry', async () => {
    const fakeWatcher = { close: vi.fn() };
    mockWatch.mockReturnValue(fakeWatcher);

    loadCanvasGraph.mockReturnValue({
      nodes: [{ id: 'n1', status: 'connected', platform: 'telegram', label: 'T' }],
      edges: [],
      workspaces: [],
      globalInstructions: '',
    });

    const updateGraph = vi.fn();
    const orchestrator = { updateGraph } as never;

    const deps: import('../daemon-watchers.js').CanvasWatcherDeps = {
      orchestrator,
      registry: null,
      queue: null,
      db: {} as never,
      router: {} as never,
      audit: {} as never,
      config: {} as never,
      globalInstructions: '',
    };

    setupCanvasWatcher(deps);
    triggerWatchCallback();

    await new Promise((r) => setTimeout(r, 150));

    expect(updateGraph).toHaveBeenCalled();
  });

  it('handles error when channel creation fails', async () => {
    const fakeWatcher = { close: vi.fn() };
    mockWatch.mockReturnValue(fakeWatcher);

    createChannelForNode.mockRejectedValue(new Error('creation failed'));

    loadCanvasGraph.mockReturnValue({
      nodes: [{ id: 'fail-node', status: 'connected', platform: 'telegram', label: 'F' }],
      edges: [],
      workspaces: [],
      globalInstructions: '',
    });

    const registry = {
      getAll: vi.fn().mockReturnValue([]),
      stop: vi.fn().mockResolvedValue(undefined),
      unregister: vi.fn(),
      register: vi.fn(),
    } as never;
    const updateGraph = vi.fn();
    const orchestrator = { updateGraph } as never;

    const deps: import('../daemon-watchers.js').CanvasWatcherDeps = {
      orchestrator,
      registry,
      queue: { enqueue: vi.fn() } as never,
      db: {} as never,
      router: {} as never,
      audit: {} as never,
      config: {} as never,
      globalInstructions: '',
    };

    setupCanvasWatcher(deps);
    triggerWatchCallback();

    // Should not throw, error is caught internally
    await new Promise((r) => setTimeout(r, 150));
    expect(updateGraph).toHaveBeenCalled();
  });

  it('handles error when removing channel fails', async () => {
    const fakeWatcher = { close: vi.fn() };
    mockWatch.mockReturnValue(fakeWatcher);

    loadCanvasGraph.mockReturnValue({
      nodes: [],
      edges: [],
      workspaces: [],
      globalInstructions: '',
    });

    const registry = {
      getAll: vi.fn().mockReturnValue([{ nodeId: 'old', channel: {} }]),
      stop: vi.fn().mockRejectedValue(new Error('stop failed')),
      unregister: vi.fn(),
      register: vi.fn(),
    } as never;
    const updateGraph = vi.fn();
    const orchestrator = { updateGraph } as never;

    const deps: import('../daemon-watchers.js').CanvasWatcherDeps = {
      orchestrator,
      registry,
      queue: null,
      db: {} as never,
      router: {} as never,
      audit: {} as never,
      config: {} as never,
      globalInstructions: '',
    };

    setupCanvasWatcher(deps);
    triggerWatchCallback();

    await new Promise((r) => setTimeout(r, 150));
    // Should not throw, error is caught
    expect(updateGraph).toHaveBeenCalled();
  });

  it('does not add channel when createChannelForNode returns null', async () => {
    const fakeWatcher = { close: vi.fn() };
    mockWatch.mockReturnValue(fakeWatcher);

    createChannelForNode.mockResolvedValue(null);

    loadCanvasGraph.mockReturnValue({
      nodes: [{ id: 'null-node', status: 'connected', platform: 'telegram', label: 'N' }],
      edges: [],
      workspaces: [],
      globalInstructions: '',
    });

    const registerFn = vi.fn();
    const registry = {
      getAll: vi.fn().mockReturnValue([]),
      stop: vi.fn(),
      unregister: vi.fn(),
      register: registerFn,
    } as never;
    const updateGraph = vi.fn();
    const orchestrator = { updateGraph } as never;

    const deps: import('../daemon-watchers.js').CanvasWatcherDeps = {
      orchestrator,
      registry,
      queue: null,
      db: {} as never,
      router: {} as never,
      audit: {} as never,
      config: {} as never,
      globalInstructions: '',
    };

    setupCanvasWatcher(deps);
    triggerWatchCallback();

    await new Promise((r) => setTimeout(r, 150));
    expect(registerFn).not.toHaveBeenCalled();
  });
});

describe('additional coverage — setupOwnerCommandWatcher processing', () => {
  let setupOwnerCommandWatcher: typeof import('../daemon-watchers.js').setupOwnerCommandWatcher;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../daemon-watchers.js');
    setupOwnerCommandWatcher = mod.setupOwnerCommandWatcher;
  });

  function triggerWatchCallback(): void {
    const cb = mockWatch.mock.calls[0]?.[2] as (() => void) | undefined;
    if (cb) cb();
  }

  it('processes valid owner commands from file', () => {
    mockExistsSync.mockReturnValue(true);
    const fakeWatcher = { close: vi.fn() };
    mockWatch.mockReturnValue(fakeWatcher);

    const handleOwnerCommand = vi.fn();
    const orchestrator = { handleOwnerCommand } as never;
    const logAction = vi.fn();
    const audit = { logAction } as never;

    setupOwnerCommandWatcher(orchestrator, audit);

    const validCommand = JSON.stringify({ type: 'promote', agentId: 'n1', newAutonomy: 'full' });
    mockReadFileSync.mockReturnValue(validCommand + '\n');

    triggerWatchCallback();

    expect(logAction).toHaveBeenCalledWith('owner:command_received', expect.any(Object));
    expect(handleOwnerCommand).toHaveBeenCalled();
    expect(mockWriteFileSync).toHaveBeenCalledWith('/mock/owner-commands.jsonl', '', 'utf-8');
  });

  it('handles invalid JSON lines gracefully', () => {
    mockExistsSync.mockReturnValue(true);
    const fakeWatcher = { close: vi.fn() };
    mockWatch.mockReturnValue(fakeWatcher);

    const handleOwnerCommand = vi.fn();
    const orchestrator = { handleOwnerCommand } as never;
    const audit = { logAction: vi.fn() } as never;

    setupOwnerCommandWatcher(orchestrator, audit);

    mockReadFileSync.mockReturnValue('not valid json\n');

    triggerWatchCallback();

    expect(handleOwnerCommand).not.toHaveBeenCalled();
    // Failed lines are preserved
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      '/mock/owner-commands.jsonl',
      'not valid json\n',
      'utf-8',
    );
  });

  it('handles invalid schema but valid JSON', () => {
    mockExistsSync.mockReturnValue(true);
    const fakeWatcher = { close: vi.fn() };
    mockWatch.mockReturnValue(fakeWatcher);

    const handleOwnerCommand = vi.fn();
    const orchestrator = { handleOwnerCommand } as never;
    const audit = { logAction: vi.fn() } as never;

    setupOwnerCommandWatcher(orchestrator, audit);

    mockReadFileSync.mockReturnValue(JSON.stringify({ type: 'invalid_type_xyz' }) + '\n');

    triggerWatchCallback();

    expect(handleOwnerCommand).not.toHaveBeenCalled();
  });

  it('skips processing when file does not exist', () => {
    // First call: file does not exist (for initial creation check)
    // Second call within processOwnerCommands: file does not exist
    mockExistsSync.mockReturnValue(false);
    const fakeWatcher = { close: vi.fn() };
    mockWatch.mockReturnValue(fakeWatcher);

    const handleOwnerCommand = vi.fn();
    const orchestrator = { handleOwnerCommand } as never;
    const audit = { logAction: vi.fn() } as never;

    setupOwnerCommandWatcher(orchestrator, audit);
    triggerWatchCallback();

    expect(handleOwnerCommand).not.toHaveBeenCalled();
  });

  it('skips processing when file is empty', () => {
    mockExistsSync.mockReturnValue(true);
    const fakeWatcher = { close: vi.fn() };
    mockWatch.mockReturnValue(fakeWatcher);

    const handleOwnerCommand = vi.fn();
    const orchestrator = { handleOwnerCommand } as never;
    const audit = { logAction: vi.fn() } as never;

    setupOwnerCommandWatcher(orchestrator, audit);
    mockReadFileSync.mockReturnValue('');

    triggerWatchCallback();

    expect(handleOwnerCommand).not.toHaveBeenCalled();
  });

  it('handles readFileSync throwing an error', () => {
    mockExistsSync.mockReturnValue(true);
    const fakeWatcher = { close: vi.fn() };
    mockWatch.mockReturnValue(fakeWatcher);

    const handleOwnerCommand = vi.fn();
    const orchestrator = { handleOwnerCommand } as never;
    const audit = { logAction: vi.fn() } as never;

    setupOwnerCommandWatcher(orchestrator, audit);
    mockReadFileSync.mockImplementation(() => {
      throw new Error('EACCES');
    });

    // Should not throw
    expect(() => triggerWatchCallback()).not.toThrow();
    expect(handleOwnerCommand).not.toHaveBeenCalled();
  });
});
