import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
}));

vi.mock('../config/paths.js', () => ({
  paths: {
    canvas: '/mock-home/.sauria/canvas.json',
  },
}));

vi.mock('../utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { readFileSync, existsSync } from 'node:fs';
import { loadCanvasGraph, buildOwnerIdentity } from '../graph-loader.js';

describe('loadCanvasGraph', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty graph when canvas file does not exist', () => {
    vi.mocked(existsSync).mockReturnValue(false);

    const graph = loadCanvasGraph();

    expect(graph.version).toBe(2);
    expect(graph.nodes).toEqual([]);
    expect(graph.edges).toEqual([]);
    expect(graph.workspaces).toEqual([]);
  });

  it('parses valid canvas file', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({
        version: 2,
        globalInstructions: 'Be helpful',
        nodes: [
          {
            id: 'n1',
            platform: 'telegram',
            label: '@bot',
            photo: null,
            position: { x: 100, y: 200 },
            status: 'connected',
            credentials: 'vault',
            meta: {},
            role: 'lead',
            autonomy: 'full',
          },
        ],
        edges: [{ id: 'e1', from: 'n1', to: 'n2', label: 'forward' }],
        workspaces: [
          {
            id: 'w1',
            name: 'Sales',
            color: '#ff0000',
            purpose: 'Handle sales',
            topics: ['sales'],
            budget: 10,
            position: { x: 0, y: 0 },
            size: { w: 400, h: 300 },
          },
        ],
        viewport: { x: 50, y: 50, zoom: 1.5 },
      }),
    );

    const graph = loadCanvasGraph();

    expect(graph.version).toBe(2);
    expect(graph.globalInstructions).toBe('Be helpful');
    expect(graph.nodes).toHaveLength(1);
    expect(graph.nodes[0]?.id).toBe('n1');
    expect(graph.nodes[0]?.role).toBe('lead');
    expect(graph.nodes[0]?.autonomy).toBe('full');
    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0]?.edgeType).toBe('manual');
    expect(graph.edges[0]?.rules).toEqual([{ type: 'always', action: 'forward' }]);
    expect(graph.workspaces).toHaveLength(1);
    expect(graph.workspaces[0]?.size.width).toBe(400);
    expect(graph.workspaces[0]?.size.height).toBe(300);
    expect(graph.workspaces[0]?.budget.dailyLimitUsd).toBe(10);
    expect(graph.viewport).toEqual({ x: 50, y: 50, zoom: 1.5 });
  });

  it('normalizes invalid autonomy to supervised', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({
        nodes: [
          {
            id: 'n1',
            platform: 'telegram',
            label: '@bot',
            photo: null,
            position: { x: 0, y: 0 },
            status: 'connected',
            credentials: 'vault',
            meta: {},
            autonomy: 'invalid_level',
          },
        ],
      }),
    );

    const graph = loadCanvasGraph();

    expect(graph.nodes[0]?.autonomy).toBe('supervised');
  });

  it('normalizes invalid role to assistant', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({
        nodes: [
          {
            id: 'n1',
            platform: 'telegram',
            label: '@bot',
            photo: null,
            position: { x: 0, y: 0 },
            status: 'connected',
            credentials: 'vault',
            meta: {},
            role: 'invalid_role',
          },
        ],
      }),
    );

    const graph = loadCanvasGraph();

    expect(graph.nodes[0]?.role).toBe('assistant');
  });

  it('normalizes invalid status to disconnected', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({
        nodes: [
          {
            id: 'n1',
            platform: 'telegram',
            label: '@bot',
            photo: null,
            position: { x: 0, y: 0 },
            status: 'unknown_status',
            credentials: 'vault',
            meta: {},
          },
        ],
      }),
    );

    const graph = loadCanvasGraph();

    expect(graph.nodes[0]?.status).toBe('disconnected');
  });

  it('handles workspace with width/height instead of w/h', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({
        workspaces: [
          {
            id: 'w1',
            name: 'Test',
            color: '#000',
            purpose: 'testing',
            topics: [],
            budget: { dailyLimitUsd: 5, preferCheap: false },
            position: { x: 0, y: 0 },
            size: { width: 500, height: 400 },
          },
        ],
      }),
    );

    const graph = loadCanvasGraph();

    expect(graph.workspaces[0]?.size.width).toBe(500);
    expect(graph.workspaces[0]?.size.height).toBe(400);
  });

  it('falls back to empty graph on parse error', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('invalid json{{{');

    const graph = loadCanvasGraph();

    expect(graph.nodes).toEqual([]);
    expect(graph.edges).toEqual([]);
  });

  it('defaults globalInstructions to empty string', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({}));

    const graph = loadCanvasGraph();

    expect(graph.globalInstructions).toBe('');
  });

  it('preserves instances from parsed graph', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({
        instances: [
          {
            id: 'github:default',
            integrationId: 'github',
            label: 'GitHub',
            connectedAt: '2026-01-01',
          },
        ],
      }),
    );

    const graph = loadCanvasGraph();

    expect(graph.instances!).toHaveLength(1);
    expect(graph.instances![0]?.id).toBe('github:default');
  });
});

describe('buildOwnerIdentity', () => {
  it('extracts owner identities from config', () => {
    const config = {
      owner: {
        telegram: { userId: 12345 },
        slack: { userId: 'U123' },
        whatsapp: { phoneNumber: '+1234567890' },
      },
    };

    const identity = buildOwnerIdentity(config as never);

    expect(identity.telegram).toEqual({ userId: 12345 });
    expect(identity.slack).toEqual({ userId: 'U123' });
    expect(identity.whatsapp).toEqual({ phoneNumber: '+1234567890' });
  });

  it('handles undefined owner fields', () => {
    const config = {
      owner: {
        telegram: undefined,
        slack: undefined,
        whatsapp: undefined,
      },
    };

    const identity = buildOwnerIdentity(config as never);

    expect(identity.telegram).toBeUndefined();
    expect(identity.slack).toBeUndefined();
    expect(identity.whatsapp).toBeUndefined();
  });
});
