import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { persistCanvasGraph, persistCanvasGraphDebounced } from '../graph-persistence.js';

vi.mock('../utils/logger.js', () => ({
  getLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

function makeGraph(nodes: string[] = []) {
  return {
    version: 2,
    nodes: nodes.map((id) => ({
      id,
      type: 'agent',
      label: id,
      x: 0,
      y: 0,
      platform: 'telegram',
      settings: {},
    })),
    edges: [],
    workspaces: [],
  };
}

describe('persistCanvasGraph', () => {
  let tempDir: string;
  let filePath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'sauria-test-'));
    filePath = join(tempDir, 'canvas.json');
  });

  it('writes graph as formatted JSON', () => {
    const graph = makeGraph(['agent-1']);
    persistCanvasGraph(filePath, graph as never);

    const content = readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(content);
    expect(parsed.version).toBe(2);
    expect(parsed.nodes).toHaveLength(1);
    expect(parsed.nodes[0].id).toBe('agent-1');
  });

  it('overwrites existing file', () => {
    const graph1 = makeGraph(['old']);
    persistCanvasGraph(filePath, graph1 as never);

    const graph2 = makeGraph(['new']);
    persistCanvasGraph(filePath, graph2 as never);

    const content = readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(content);
    expect(parsed.nodes[0].id).toBe('new');
  });

  it('creates backup files when file exists', () => {
    writeFileSync(filePath, '{"version":1}', 'utf-8');

    const graph = makeGraph(['updated']);
    persistCanvasGraph(filePath, graph as never);

    const backups = readdirSync(tempDir).filter((f) => f.includes('.bak.'));
    expect(backups.length).toBeGreaterThanOrEqual(1);
  });

  it('rotates old backups keeping at most MAX_BACKUPS', () => {
    for (let i = 0; i < 5; i++) {
      writeFileSync(filePath, `{"version":${i}}`, 'utf-8');
      persistCanvasGraph(filePath, makeGraph([`v${i}`]) as never);
    }

    const backups = readdirSync(tempDir).filter((f) => f.includes('.bak.'));
    expect(backups.length).toBeLessThanOrEqual(3);
  });

  it('handles non-existent file without error', () => {
    const newPath = join(tempDir, 'nonexistent.json');
    expect(() => persistCanvasGraph(newPath, makeGraph() as never)).not.toThrow();
    expect(existsSync(newPath)).toBe(true);
  });
});

describe('persistCanvasGraphDebounced', () => {
  it('does not write immediately', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'sauria-debounce-'));
    const filePath = join(tempDir, 'canvas.json');

    persistCanvasGraphDebounced(filePath, makeGraph(['debounced']) as never);

    expect(existsSync(filePath)).toBe(false);
  });

  it('writes file after debounce delay', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'sauria-debounce2-'));
    const filePath = join(tempDir, 'canvas.json');

    persistCanvasGraphDebounced(filePath, makeGraph(['delayed']) as never);

    // Wait for debounce (300ms) + async write
    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(existsSync(filePath)).toBe(true);
    const parsed = JSON.parse(readFileSync(filePath, 'utf-8'));
    expect(parsed.nodes[0].id).toBe('delayed');
  });
});
