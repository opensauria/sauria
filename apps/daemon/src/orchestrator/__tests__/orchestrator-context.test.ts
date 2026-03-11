import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../graph-persistence.js', () => ({
  persistCanvasGraph: vi.fn(),
}));
const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};
vi.mock('../../utils/logger.js', () => ({
  getLogger: vi.fn(() => mockLogger),
}));
vi.mock('nanoid', () => ({
  nanoid: vi.fn(() => 'mock-id'),
}));
vi.mock('@sauria/ipc-protocol', () => ({
  IPC_EVENTS: {
    ACTIVITY_MESSAGE: 'activity:message',
    ACTIVITY_EDGE: 'activity:edge',
  },
}));
vi.mock('../orchestrator-helpers.js', () => ({
  findGroupForNode: vi.fn(() => vi.fn()),
}));

import { persistCanvasGraph } from '../../graph-persistence.js';
import { getLogger } from '../../utils/logger.js';
import {
  persistGraph,
  buildActionContext,
  buildHelperDeps,
  buildApprovalContext,
  buildOwnerCommandContext,
} from '../orchestrator-context.js';
import type { OrchestratorState } from '../orchestrator-context.js';
import type { CanvasGraph } from '../types.js';

function createMockState(overrides: Partial<OrchestratorState> = {}): OrchestratorState {
  return {
    graph: {
      version: 2,
      nodes: [],
      edges: [],
      workspaces: [],
      globalInstructions: '',
      viewport: { x: 0, y: 0, zoom: 1 },
    } as CanvasGraph,
    registry: { sendTo: vi.fn() } as never,
    ownerIdentity: { telegram: { userId: 123 } },
    brain: null,
    db: null,
    agentMemory: null,
    kpiTracker: null,
    checkpointManager: null,
    canvasPath: '/mock/canvas.json',
    onActivity: null,
    integrationRegistry: null,
    codeModeRouter: null,
    ...overrides,
  };
}

describe('persistGraph', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes graph to canvas path', () => {
    const state = createMockState();
    persistGraph(state);
    expect(persistCanvasGraph).toHaveBeenCalledWith('/mock/canvas.json', state.graph);
  });

  it('returns early when canvasPath is null', () => {
    const state = createMockState({ canvasPath: null });
    persistGraph(state);
    expect(persistCanvasGraph).not.toHaveBeenCalled();
  });

  it('logs warning on write failure', () => {
    vi.mocked(persistCanvasGraph).mockImplementation(() => {
      throw new Error('write failed');
    });
    const state = createMockState();
    persistGraph(state);
    const logger = getLogger();
    expect(logger.warn).toHaveBeenCalledWith(
      'Failed to persist canvas graph',
      expect.objectContaining({ error: 'write failed' }),
    );
  });
});

describe('buildActionContext', () => {
  it('returns all required ActionContext properties', () => {
    const state = createMockState();
    const findNode = vi.fn();
    const findWorkspace = vi.fn();
    const handleInbound = vi.fn();

    const ctx = buildActionContext(state, findNode, findWorkspace, handleInbound);

    expect(ctx.graph).toBe(state.graph);
    expect(ctx.registry).toBe(state.registry);
    expect(ctx.db).toBe(state.db);
    expect(ctx.agentMemory).toBe(state.agentMemory);
    expect(ctx.findNode).toBe(findNode);
    expect(ctx.findWorkspace).toBe(findWorkspace);
    expect(ctx.handleInbound).toBe(handleInbound);
    expect(typeof ctx.emitMessage).toBe('function');
    expect(typeof ctx.emitEdge).toBe('function');
  });
});

describe('buildHelperDeps', () => {
  it('returns HelperDeps from state', () => {
    const state = createMockState();
    const deps = buildHelperDeps(state);
    expect(deps.graph).toBe(state.graph);
    expect(deps.agentMemory).toBe(state.agentMemory);
    expect(deps.ownerIdentity).toBe(state.ownerIdentity);
    expect(typeof deps.findNode).toBe('function');
  });
});

describe('buildApprovalContext', () => {
  it('returns ApprovalContext from state', () => {
    const state = createMockState();
    const ctx = buildApprovalContext(state);
    expect(ctx.registry).toBe(state.registry);
    expect(ctx.ownerIdentity).toBe(state.ownerIdentity);
    expect(typeof ctx.getGraph).toBe('function');
  });
});

describe('buildOwnerCommandContext', () => {
  it('returns OwnerCommandContext with all properties', () => {
    const state = createMockState();
    const resolveAgent = vi.fn();
    const updateNode = vi.fn();
    const persist = vi.fn();

    const ctx = buildOwnerCommandContext(state, resolveAgent, updateNode, persist);

    expect(typeof ctx.getGraph).toBe('function');
    expect(typeof ctx.setGraph).toBe('function');
    expect(ctx.registry).toBe(state.registry);
    expect(ctx.kpiTracker).toBe(state.kpiTracker);
    expect(ctx.ownerIdentity).toBe(state.ownerIdentity);
    expect(ctx.resolveAgent).toBe(resolveAgent);
    expect(ctx.updateNode).toBe(updateNode);
    expect(ctx.persistGraph).toBe(persist);
    expect(typeof ctx.findGroupForNode).toBe('function');
  });
});
