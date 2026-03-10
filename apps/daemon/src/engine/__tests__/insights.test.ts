import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { generateInsight } from '../insights.js';
import { applySchema } from '../../db/schema.js';

vi.mock('../../db/world-model.js', () => ({
  addObservation: vi.fn(),
}));

vi.mock('../../security/rate-limiter.js', () => ({
  SECURITY_LIMITS: {
    ai: { deepReasoningCallsPerDay: 10 },
    ingestion: { maxEventsPerHour: 500, maxEmailsPerSync: 100 },
    channels: { maxProactiveAlertsPerDay: 5, cooldownBetweenSimilarAlerts: 7200 },
    mcp: {},
    database: {},
  },
}));

function createTestDb(): InstanceType<typeof Database> {
  const db = new Database(':memory:');
  applySchema(db);
  return db;
}

function createMockRouter(responseText: string) {
  return {
    deepAnalyze: vi.fn(async function* () {
      yield { text: responseText };
    }),
  } as unknown as Parameters<typeof generateInsight>[1];
}

describe('generateInsight', () => {
  let db: InstanceType<typeof Database>;

  beforeEach(() => {
    db = createTestDb();
    vi.clearAllMocks();
  });

  afterEach(() => {
    db.close();
  });

  it('returns null for empty context', async () => {
    const router = createMockRouter('');
    const result = await generateInsight(db, router, '   ');
    expect(result).toBeNull();
  });

  it('returns null when daily insight limit is reached', async () => {
    for (let i = 0; i < 10; i++) {
      db.prepare(
        "INSERT INTO observations (id, type, content, confidence, created_at) VALUES (?, 'insight', 'test', 0.5, datetime('now'))",
      ).run(`obs-${i}`);
    }
    const router = createMockRouter('{}');
    const result = await generateInsight(db, router, 'some context');
    expect(result).toBeNull();
  });

  it('returns null when LLM response has no JSON', async () => {
    const router = createMockRouter('No JSON here');
    const result = await generateInsight(db, router, 'some context');
    expect(result).toBeNull();
  });

  it('returns null when LLM response has invalid JSON structure', async () => {
    const router = createMockRouter('{ "unrelated": true }');
    const result = await generateInsight(db, router, 'some context');
    expect(result).toBeNull();
  });

  it('returns null when insight field is empty', async () => {
    const router = createMockRouter('{ "insight": "  ", "entityIds": [], "confidence": 0.5 }');
    const result = await generateInsight(db, router, 'some context');
    expect(result).toBeNull();
  });

  it('parses valid insight response and stores observation', async () => {
    const { addObservation } = await import('../../db/world-model.js');
    const response = JSON.stringify({
      insight: 'Pattern detected in meetings',
      entityIds: ['ent-1'],
      confidence: 0.85,
    });
    const router = createMockRouter(response);

    const result = await generateInsight(db, router, 'recent meetings data');

    expect(result).not.toBeNull();
    expect(result?.content).toBe('Pattern detected in meetings');
    expect(result?.entityIds).toEqual(['ent-1']);
    expect(result?.confidence).toBe(0.85);
    expect(result?.generatedAt).toBeDefined();
    expect(addObservation).toHaveBeenCalledOnce();
  });

  it('clamps confidence to 0-1 range', async () => {
    const response = JSON.stringify({
      insight: 'An insight',
      entityIds: [],
      confidence: 5.0,
    });
    const router = createMockRouter(response);

    const result = await generateInsight(db, router, 'context');

    expect(result?.confidence).toBe(1);
  });

  it('defaults confidence to 0.5 when not a number', async () => {
    const response = JSON.stringify({
      insight: 'An insight',
      entityIds: [],
      confidence: 'high',
    });
    const router = createMockRouter(response);

    const result = await generateInsight(db, router, 'context');

    expect(result?.confidence).toBe(0.5);
  });

  it('filters non-string entityIds', async () => {
    const response = JSON.stringify({
      insight: 'An insight',
      entityIds: ['valid', 42, null, 'also-valid'],
      confidence: 0.7,
    });
    const router = createMockRouter(response);

    const result = await generateInsight(db, router, 'context');

    expect(result?.entityIds).toEqual(['valid', 'also-valid']);
  });

  it('handles JSON embedded in surrounding text', async () => {
    const router = createMockRouter(
      'Here is the result: { "insight": "embedded insight", "entityIds": [], "confidence": 0.6 } done.',
    );

    const result = await generateInsight(db, router, 'context');

    expect(result?.content).toBe('embedded insight');
  });
});
