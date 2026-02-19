import type BetterSqlite3 from 'better-sqlite3';
import { getDecayingRelationships } from '../db/temporal.js';

export interface RelationDecayAlert {
  readonly type: 'relationship_decay';
  readonly priority: 'high' | 'medium' | 'low';
  readonly numericPriority: number;
  readonly title: string;
  readonly details: string;
  readonly entityId: string;
  readonly entityName: string;
  readonly daysSinceLastContact: number;
  readonly averageGapDays: number;
  readonly decayRatio: number;
}

const MIN_DECAY_RATIO = 1.5;
const DEFAULT_THRESHOLD_DAYS = 14;

function classifyDecayPriority(ratio: number): RelationDecayAlert['priority'] {
  if (ratio > 3) return 'high';
  if (ratio > 2) return 'medium';
  return 'low';
}

const PRIORITY_ORDER: Readonly<Record<string, number>> = {
  high: 3,
  medium: 2,
  low: 1,
};

export function detectDecay(
  db: BetterSqlite3.Database,
  thresholdDays = DEFAULT_THRESHOLD_DAYS,
): RelationDecayAlert[] {
  const decaying = getDecayingRelationships(db, thresholdDays);

  return decaying
    .map((d) => {
      const { entity, daysSinceContact, averageGapDays } = d;
      const decayRatio =
        averageGapDays > 0
          ? Math.round((daysSinceContact / averageGapDays) * 100) / 100
          : daysSinceContact > DEFAULT_THRESHOLD_DAYS
            ? 999
            : 0;

      return { entity, daysSinceContact, averageGapDays, decayRatio };
    })
    .filter((d) => d.decayRatio >= MIN_DECAY_RATIO)
    .map((d) => {
      const priority = classifyDecayPriority(d.decayRatio);
      return {
        type: 'relationship_decay' as const,
        priority,
        numericPriority: PRIORITY_ORDER[priority] ?? 0,
        title: `Losing touch with ${d.entity.name}`,
        details: `No contact for ${d.daysSinceContact} days (usual gap: ${d.averageGapDays} days, ratio: ${d.decayRatio}x)`,
        entityId: d.entity.id,
        entityName: d.entity.name,
        daysSinceLastContact: d.daysSinceContact,
        averageGapDays: d.averageGapDays,
        decayRatio: d.decayRatio,
      };
    })
    .sort((a, b) => b.decayRatio - a.decayRatio);
}
