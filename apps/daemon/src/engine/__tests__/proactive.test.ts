import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { ProactiveEngine } from '../proactive.js';
import { applySchema } from '../../db/schema.js';

vi.mock('../deadlines.js', () => ({
  scanDeadlines: vi.fn(() => []),
}));

vi.mock('../relations.js', () => ({
  detectDecay: vi.fn(() => []),
}));

vi.mock('../patterns.js', () => ({
  detectPatterns: vi.fn(() => []),
}));

vi.mock('../insights.js', () => ({
  generateInsight: vi.fn(async () => null),
}));

vi.mock('../../security/audit.js', () => ({
  AuditLogger: class {
    logAction = vi.fn();
  },
}));

vi.mock('../../security/rate-limiter.js', () => ({
  SECURITY_LIMITS: {
    ai: { deepReasoningCallsPerDay: 10 },
    ingestion: { maxEventsPerHour: 500 },
    channels: {
      maxProactiveAlertsPerDay: 5,
      cooldownBetweenSimilarAlerts: 7200,
    },
    mcp: {},
    database: {},
  },
}));

vi.mock('../alert-converters.js', async () => {
  const actual =
    await vi.importActual<typeof import('../alert-converters.js')>('../alert-converters.js');
  return {
    ...actual,
    buildInsightContext: vi.fn(() => ''),
  };
});

import { scanDeadlines } from '../deadlines.js';
import { detectDecay } from '../relations.js';
import { detectPatterns } from '../patterns.js';
import { generateInsight } from '../insights.js';
import { buildInsightContext } from '../alert-converters.js';

const mockScanDeadlines = vi.mocked(scanDeadlines);
const mockDetectDecay = vi.mocked(detectDecay);
const mockDetectPatterns = vi.mocked(detectPatterns);
const mockGenerateInsight = vi.mocked(generateInsight);
const mockBuildInsightContext = vi.mocked(buildInsightContext);

function createTestDb(): InstanceType<typeof Database> {
  const db = new Database(':memory:');
  applySchema(db);
  return db;
}

function createMockRouter() {
  return {} as Parameters<(typeof ProactiveEngine.prototype)['start']> extends never[]
    ? never
    : ConstructorParameters<typeof ProactiveEngine>[1];
}

describe('ProactiveEngine', () => {
  let db: InstanceType<typeof Database>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-10T12:00:00.000Z'));
    db = createTestDb();
    vi.clearAllMocks();
  });

  afterEach(() => {
    db.close();
    vi.useRealTimers();
  });

  it('start triggers an immediate tick', async () => {
    const onAlert = vi.fn();
    const engine = new ProactiveEngine(db, createMockRouter(), onAlert);
    engine.start(60_000);
    await vi.advanceTimersByTimeAsync(0);
    engine.stop();

    expect(mockScanDeadlines).toHaveBeenCalledOnce();
    expect(mockDetectDecay).toHaveBeenCalledOnce();
    expect(mockDetectPatterns).toHaveBeenCalledOnce();
  });

  it('start is idempotent - second call does nothing', async () => {
    const engine = new ProactiveEngine(db, createMockRouter(), vi.fn());
    engine.start(60_000);
    engine.start(60_000);
    await vi.advanceTimersByTimeAsync(0);
    engine.stop();

    expect(mockScanDeadlines).toHaveBeenCalledOnce();
  });

  it('stop clears interval and is idempotent', () => {
    const engine = new ProactiveEngine(db, createMockRouter(), vi.fn());
    engine.stop(); // no-op when not started
    engine.start(60_000);
    engine.stop();
    engine.stop(); // second stop is no-op
  });

  it('emits alerts from deadline scanner', async () => {
    mockScanDeadlines.mockReturnValue([
      {
        type: 'deadline_approaching',
        priority: 'critical',
        numericPriority: 4,
        title: 'Due soon: Deploy',
        details: 'Due in 2h',
        relatedEntityIds: ['ent-1'],
        scheduledFor: '2026-03-10T14:00:00Z',
        hoursUntil: 2,
      },
    ]);

    const onAlert = vi.fn();
    const engine = new ProactiveEngine(db, createMockRouter(), onAlert);
    engine.start(60_000);
    await vi.advanceTimersByTimeAsync(0);
    engine.stop();

    expect(onAlert).toHaveBeenCalledOnce();
    expect(onAlert.mock.calls[0]?.[0].type).toBe('deadline_approaching');
  });

  it('respects MAX_ALERTS_PER_TICK limit of 5', async () => {
    mockScanDeadlines.mockReturnValue(
      Array.from({ length: 10 }, (_, i) => ({
        type: 'deadline_approaching',
        priority: 'critical' as const,
        numericPriority: 4,
        title: `Task ${i}`,
        details: `Due soon`,
        relatedEntityIds: [`ent-${i}`],
        scheduledFor: '2026-03-10T14:00:00Z',
        hoursUntil: 2,
      })),
    );

    const onAlert = vi.fn();
    const engine = new ProactiveEngine(db, createMockRouter(), onAlert);
    engine.start(60_000);
    await vi.advanceTimersByTimeAsync(0);
    engine.stop();

    expect(onAlert).toHaveBeenCalledTimes(5);
  });

  it('deduplicates alerts with same key within cooldown', async () => {
    const deadlineAlert: import('../deadlines.js').DeadlineAlert = {
      type: 'deadline_approaching',
      priority: 'critical',
      numericPriority: 4,
      title: 'Due soon: Deploy',
      details: 'Due in 2h',
      relatedEntityIds: ['ent-1'],
      scheduledFor: '2026-03-10T14:00:00Z',
      hoursUntil: 2,
    };

    mockScanDeadlines.mockReturnValue([deadlineAlert]);

    const onAlert = vi.fn();
    const engine = new ProactiveEngine(db, createMockRouter(), onAlert);
    engine.start(60_000);
    await vi.advanceTimersByTimeAsync(0);

    // Second tick - same alert should be deduplicated
    await vi.advanceTimersByTimeAsync(60_000);
    engine.stop();

    expect(onAlert).toHaveBeenCalledOnce();
  });

  it('getTaskManager returns a TaskManager instance', () => {
    const engine = new ProactiveEngine(db, createMockRouter(), vi.fn());
    const tm = engine.getTaskManager();
    expect(tm).toBeDefined();
    expect(typeof tm.createTask).toBe('function');
  });

  it('emits overdue task alerts', async () => {
    const pastDate = new Date(Date.now() - 86_400_000).toISOString();
    const tm = new ProactiveEngine(db, createMockRouter(), vi.fn()).getTaskManager();
    tm.createTask({ title: 'Overdue item', scheduledFor: pastDate, priority: 'high' });

    const onAlert = vi.fn();
    const engine = new ProactiveEngine(db, createMockRouter(), onAlert);
    engine.start(60_000);
    await vi.advanceTimersByTimeAsync(0);
    engine.stop();

    const overdueAlerts = onAlert.mock.calls
      .map((c) => c[0])
      .filter((a: { type: string }) => a.type === 'task_overdue');
    expect(overdueAlerts.length).toBeGreaterThanOrEqual(1);
  });

  it('generates insight when context is available', async () => {
    mockBuildInsightContext.mockReturnValue('some recent events');
    mockGenerateInsight.mockResolvedValue({
      id: 'ins-1',
      content: 'Detected pattern',
      entityIds: ['ent-1'],
      confidence: 0.8,
      generatedAt: '2026-03-10T12:00:00Z',
    });

    const onAlert = vi.fn();
    const engine = new ProactiveEngine(db, createMockRouter(), onAlert);
    engine.start(60_000);
    await vi.advanceTimersByTimeAsync(0);
    engine.stop();

    const insightAlerts = onAlert.mock.calls
      .map((c) => c[0])
      .filter((a: { type: string }) => a.type === 'insight');
    expect(insightAlerts).toHaveLength(1);
    expect(insightAlerts[0].details).toBe('Detected pattern');
  });

  it('catches insight generation errors without crashing', async () => {
    mockBuildInsightContext.mockReturnValue('some context');
    mockGenerateInsight.mockRejectedValue(new Error('API key missing'));

    const onAlert = vi.fn();
    const engine = new ProactiveEngine(db, createMockRouter(), onAlert);
    engine.start(60_000);

    await expect(vi.advanceTimersByTimeAsync(0)).resolves.not.toThrow();
    engine.stop();
  });

  it('cleanupStaleKeys removes expired keys after 1 hour', async () => {
    const deadlineAlert = {
      type: 'deadline_approaching' as const,
      priority: 'critical' as const,
      numericPriority: 4,
      title: 'Due soon: Task',
      details: 'Due in 2h',
      relatedEntityIds: ['ent-1'],
      scheduledFor: '2026-03-10T14:00:00Z',
      hoursUntil: 2,
    };
    mockScanDeadlines.mockReturnValue([deadlineAlert]);

    const onAlert = vi.fn();
    const engine = new ProactiveEngine(db, createMockRouter(), onAlert);
    engine.start(60_000);
    await vi.advanceTimersByTimeAsync(0);
    expect(onAlert).toHaveBeenCalledTimes(1);

    // Advance past cooldown (7200s = 2h) AND past cleanup interval (1h)
    // The COOLDOWN_MS = 7200 * 1000 = 7200000ms
    await vi.advanceTimersByTimeAsync(7_200_000 + 60_000);

    // Alert should fire again since key was cleaned up and cooldown passed
    expect(onAlert.mock.calls.length).toBeGreaterThan(1);
    engine.stop();
  });

  it('skips insight generation when daily alert limit reached', async () => {
    // Emit exactly MAX_ALERTS_PER_DAY (5) alerts to hit the daily limit
    mockScanDeadlines.mockReturnValue(
      Array.from({ length: 5 }, (_, i) => ({
        type: 'deadline_approaching' as const,
        priority: 'critical' as const,
        numericPriority: 4,
        title: `Unique task ${i}`,
        details: 'Due soon',
        relatedEntityIds: [`ent-${i}`],
        scheduledFor: '2026-03-10T14:00:00Z',
        hoursUntil: 2,
      })),
    );

    const onAlert = vi.fn();
    const engine = new ProactiveEngine(db, createMockRouter(), onAlert);
    engine.start(60_000);
    await vi.advanceTimersByTimeAsync(0);
    engine.stop();

    expect(onAlert).toHaveBeenCalledTimes(5);
    expect(mockGenerateInsight).not.toHaveBeenCalled();
  });

  it('skips insight when buildInsightContext returns empty string', async () => {
    mockBuildInsightContext.mockReturnValue('');
    mockScanDeadlines.mockReturnValue([]);

    const onAlert = vi.fn();
    const engine = new ProactiveEngine(db, createMockRouter(), onAlert);
    engine.start(60_000);
    await vi.advanceTimersByTimeAsync(0);
    engine.stop();

    expect(mockBuildInsightContext).toHaveBeenCalled();
    expect(mockGenerateInsight).not.toHaveBeenCalled();
  });

  it('emits no insight alert when generateInsight returns null', async () => {
    mockBuildInsightContext.mockReturnValue('some context');
    mockGenerateInsight.mockResolvedValue(null);
    mockScanDeadlines.mockReturnValue([]);

    const onAlert = vi.fn();
    const engine = new ProactiveEngine(db, createMockRouter(), onAlert);
    engine.start(60_000);
    await vi.advanceTimersByTimeAsync(0);
    engine.stop();

    expect(mockGenerateInsight).toHaveBeenCalled();
    const insightAlerts = onAlert.mock.calls
      .map((c) => c[0])
      .filter((a: { type: string }) => a.type === 'insight');
    expect(insightAlerts).toHaveLength(0);
  });

  it('skips duplicate insight via isDuplicate', async () => {
    const insight = {
      id: 'ins-1',
      content: 'Same pattern',
      entityIds: ['ent-1'],
      confidence: 0.8,
      generatedAt: '2026-03-10T12:00:00Z',
    };
    mockBuildInsightContext.mockReturnValue('context');
    mockGenerateInsight.mockResolvedValue(insight);
    mockScanDeadlines.mockReturnValue([]);

    const onAlert = vi.fn();
    const engine = new ProactiveEngine(db, createMockRouter(), onAlert);
    engine.start(60_000);
    await vi.advanceTimersByTimeAsync(0);

    // Second tick — same insight should be deduplicated
    await vi.advanceTimersByTimeAsync(60_000);
    engine.stop();

    const insightAlerts = onAlert.mock.calls
      .map((c) => c[0])
      .filter((a: { type: string }) => a.type === 'insight');
    expect(insightAlerts).toHaveLength(1);
  });
});
