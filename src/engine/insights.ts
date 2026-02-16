import type BetterSqlite3 from 'better-sqlite3';
import { nanoid } from 'nanoid';
import { addObservation } from '../db/world-model.js';
import { SECURITY_LIMITS } from '../security/rate-limiter.js';
import type { ModelRouter } from '../ai/router.js';
import type { ChatMessage } from '../ai/providers/base.js';

export interface InsightResult {
  readonly id: string;
  readonly content: string;
  readonly entityIds: readonly string[];
  readonly confidence: number;
  readonly generatedAt: string;
}

const INSIGHT_SYSTEM_PROMPT = `You are an analytical engine for a personal knowledge system.
Synthesize the provided context into a single actionable insight.
Respond in JSON format: { "insight": "...", "entityIds": ["..."], "confidence": 0.0-1.0 }
Be concise. Focus on non-obvious connections or emerging trends.
Do not hallucinate entity IDs; only reference IDs present in the context.`;

interface InsightCountRow {
  count: number;
}

function isInsightCountRow(value: unknown): value is InsightCountRow {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  return typeof (value as Record<string, unknown>)['count'] === 'number';
}

interface ParsedInsight {
  readonly insight: string;
  readonly entityIds: string[];
  readonly confidence: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseInsightResponse(text: string): ParsedInsight | null {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    return null;
  }

  if (!isRecord(parsed)) return null;
  if (typeof parsed['insight'] !== 'string') return null;
  if (parsed['insight'].trim().length === 0) return null;

  const entityIds = Array.isArray(parsed['entityIds'])
    ? (parsed['entityIds'] as unknown[]).filter((v): v is string => typeof v === 'string')
    : [];

  const rawConfidence = typeof parsed['confidence'] === 'number' ? parsed['confidence'] : 0.5;
  const confidence = Math.max(0, Math.min(1, rawConfidence));

  return { insight: parsed['insight'], entityIds, confidence };
}

function getDailyInsightCount(db: BetterSqlite3.Database): number {
  const row: unknown = db.prepare(
    "SELECT COUNT(*) AS count FROM observations WHERE type = 'insight' AND created_at >= datetime('now', '-1 day')",
  ).get();
  if (!isInsightCountRow(row)) return 0;
  return row.count;
}

export async function generateInsight(
  db: BetterSqlite3.Database,
  router: ModelRouter,
  context: string,
): Promise<InsightResult | null> {
  if (context.trim().length === 0) return null;

  const dailyCount = getDailyInsightCount(db);
  if (dailyCount >= SECURITY_LIMITS.ai.deepReasoningCallsPerDay) {
    return null;
  }

  const messages: ChatMessage[] = [
    { role: 'system', content: INSIGHT_SYSTEM_PROMPT },
    { role: 'user', content: context },
  ];

  let responseText = '';
  for await (const chunk of router.deepAnalyze(messages)) {
    responseText += chunk.text;
  }

  const parsed = parseInsightResponse(responseText);
  if (!parsed) return null;

  const id = nanoid();
  const generatedAt = new Date().toISOString();

  addObservation(db, {
    id,
    type: 'insight',
    content: parsed.insight,
    confidence: parsed.confidence,
    entityIds: parsed.entityIds,
  });

  return {
    id,
    content: parsed.insight,
    entityIds: parsed.entityIds,
    confidence: parsed.confidence,
    generatedAt,
  };
}
