import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { KPITracker } from '../kpi-tracker.js';
import type { CanvasGraph } from '../types.js';
import { createEmptyGraph } from '../types.js';

function createGraphWithNodes(workspaceId: string, nodeIds: string[]): CanvasGraph {
  const base = createEmptyGraph();
  return {
    ...base,
    workspaces: [
      {
        id: workspaceId,
        name: 'Test WS',
        color: '#000',
        purpose: 'testing',
        topics: [],
        budget: { dailyLimitUsd: 10, preferCheap: false },
        position: { x: 0, y: 0 },
        size: { width: 200, height: 200 },
        checkpoints: [],
        groups: [],
      },
    ],
    nodes: nodeIds.map((id) => ({
      id,
      platform: 'telegram' as const,
      label: `@${id}`,
      photo: null,
      position: { x: 0, y: 0 },
      status: 'connected' as const,
      credentials: 'key',
      meta: {},
      workspaceId,
      role: 'specialist' as const,
      autonomy: 'full' as const,
      instructions: '',
    })),
  };
}

describe('KPITracker', () => {
  let db: Database.Database;
  let tracker: KPITracker;

  beforeEach(() => {
    db = new Database(':memory:');
    tracker = new KPITracker(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('recordMessageHandled', () => {
    it('increments message count and accumulates response time', () => {
      tracker.recordMessageHandled('n1', 150);
      tracker.recordMessageHandled('n1', 250);

      const perf = tracker.getPerformance('n1');
      expect(perf.messagesHandled).toBe(2);
      expect(perf.avgResponseTimeMs).toBe(200);
    });

    it('creates row on first call', () => {
      tracker.recordMessageHandled('n1', 100);

      const perf = tracker.getPerformance('n1');
      expect(perf.messagesHandled).toBe(1);
      expect(perf.avgResponseTimeMs).toBe(100);
    });
  });

  describe('recordTaskCompleted', () => {
    it('increments task count', () => {
      tracker.recordTaskCompleted('n1');
      tracker.recordTaskCompleted('n1');
      tracker.recordTaskCompleted('n1');

      const perf = tracker.getPerformance('n1');
      expect(perf.tasksCompleted).toBe(3);
    });
  });

  describe('recordCost', () => {
    it('accumulates cost', () => {
      tracker.recordCost('n1', 0.05);
      tracker.recordCost('n1', 0.12);

      const perf = tracker.getPerformance('n1');
      expect(perf.costIncurredUsd).toBeCloseTo(0.17, 10);
    });
  });

  describe('getPerformance', () => {
    it('returns zeroed performance for unknown node', () => {
      const perf = tracker.getPerformance('unknown');
      expect(perf.messagesHandled).toBe(0);
      expect(perf.tasksCompleted).toBe(0);
      expect(perf.avgResponseTimeMs).toBe(0);
      expect(perf.costIncurredUsd).toBe(0);
    });

    it('computes avg response time correctly', () => {
      tracker.recordMessageHandled('n1', 100);
      tracker.recordMessageHandled('n1', 200);
      tracker.recordMessageHandled('n1', 300);

      const perf = tracker.getPerformance('n1');
      expect(perf.avgResponseTimeMs).toBe(200);
    });
  });

  describe('getKPIs', () => {
    it('returns four KPIs', () => {
      const kpis = tracker.getKPIs('n1');
      expect(kpis).toHaveLength(4);
    });

    it('returns KPIs with correct names and units', () => {
      const kpis = tracker.getKPIs('n1');
      const names = kpis.map((k) => k.name);
      expect(names).toContain('Messages Handled');
      expect(names).toContain('Tasks Completed');
      expect(names).toContain('Avg Response Time');
      expect(names).toContain('Cost Incurred');
    });

    it('reflects recorded metrics in KPI current values', () => {
      tracker.recordMessageHandled('n1', 500);
      tracker.recordTaskCompleted('n1');
      tracker.recordCost('n1', 0.25);

      const kpis = tracker.getKPIs('n1');
      const messagesKpi = kpis.find((k) => k.name === 'Messages Handled');
      const tasksKpi = kpis.find((k) => k.name === 'Tasks Completed');
      const costKpi = kpis.find((k) => k.name === 'Cost Incurred');

      expect(messagesKpi?.current).toBe(1);
      expect(tasksKpi?.current).toBe(1);
      expect(costKpi?.current).toBeCloseTo(0.25, 10);
    });
  });

  describe('getWorkspacePerformance', () => {
    it('returns zeroed performance for workspace with no agents', () => {
      const graph = createEmptyGraph();
      const perf = tracker.getWorkspacePerformance('ws1', graph);

      expect(perf.totalMessages).toBe(0);
      expect(perf.totalTasks).toBe(0);
      expect(perf.totalCostUsd).toBe(0);
      expect(perf.avgResponseTimeMs).toBe(0);
      expect(perf.agentCount).toBe(0);
    });

    it('aggregates across multiple agents', () => {
      const graph = createGraphWithNodes('ws1', ['n1', 'n2', 'n3']);

      tracker.recordMessageHandled('n1', 100);
      tracker.recordMessageHandled('n1', 200);
      tracker.recordMessageHandled('n2', 300);
      tracker.recordTaskCompleted('n1');
      tracker.recordTaskCompleted('n3');
      tracker.recordCost('n1', 0.1);
      tracker.recordCost('n2', 0.2);

      const perf = tracker.getWorkspacePerformance('ws1', graph);
      expect(perf.totalMessages).toBe(3);
      expect(perf.totalTasks).toBe(2);
      expect(perf.totalCostUsd).toBeCloseTo(0.3, 10);
      expect(perf.avgResponseTimeMs).toBe(200); // (100+200+300)/3
      expect(perf.agentCount).toBe(3);
    });

    it('only includes agents from the specified workspace', () => {
      const graph: CanvasGraph = {
        ...createEmptyGraph(),
        workspaces: [
          {
            id: 'ws1',
            name: 'WS1',
            color: '#000',
            purpose: 'test',
            topics: [],
            budget: { dailyLimitUsd: 10, preferCheap: false },
            position: { x: 0, y: 0 },
            size: { width: 200, height: 200 },
            checkpoints: [],
            groups: [],
          },
          {
            id: 'ws2',
            name: 'WS2',
            color: '#fff',
            purpose: 'test',
            topics: [],
            budget: { dailyLimitUsd: 10, preferCheap: false },
            position: { x: 0, y: 0 },
            size: { width: 200, height: 200 },
            checkpoints: [],
            groups: [],
          },
        ],
        nodes: [
          {
            id: 'n1',
            platform: 'telegram',
            label: '@n1',
            photo: null,
            position: { x: 0, y: 0 },
            status: 'connected',
            credentials: 'key',
            meta: {},
            workspaceId: 'ws1',
            role: 'specialist',
            autonomy: 'full',
            instructions: '',
          },
          {
            id: 'n2',
            platform: 'telegram',
            label: '@n2',
            photo: null,
            position: { x: 0, y: 0 },
            status: 'connected',
            credentials: 'key',
            meta: {},
            workspaceId: 'ws2',
            role: 'specialist',
            autonomy: 'full',
            instructions: '',
          },
        ],
      };

      tracker.recordMessageHandled('n1', 100);
      tracker.recordMessageHandled('n2', 500);

      const perfWs1 = tracker.getWorkspacePerformance('ws1', graph);
      expect(perfWs1.totalMessages).toBe(1);
      expect(perfWs1.agentCount).toBe(1);

      const perfWs2 = tracker.getWorkspacePerformance('ws2', graph);
      expect(perfWs2.totalMessages).toBe(1);
      expect(perfWs2.agentCount).toBe(1);
    });
  });

  describe('schema idempotency', () => {
    it('can create KPITracker twice on the same db', () => {
      const tracker2 = new KPITracker(db);
      tracker2.recordMessageHandled('n1', 100);
      expect(tracker2.getPerformance('n1').messagesHandled).toBe(1);
    });
  });
});
