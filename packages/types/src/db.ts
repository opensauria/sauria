/**
 * Database entity types — world model (knowledge graph).
 * Extracted from src/db/types.ts.
 */

export type EntityType =
  | 'person'
  | 'project'
  | 'company'
  | 'event'
  | 'document'
  | 'goal'
  | 'place'
  | 'concept';

export type ObservationType = 'pattern' | 'insight' | 'prediction' | 'preference' | 'fact';

export interface Entity {
  readonly id: string;
  readonly type: EntityType;
  readonly name: string;
  readonly summary: string | null;
  readonly properties: Record<string, string> | null;
  readonly importanceScore: number;
  readonly firstSeenAt: string;
  readonly lastUpdatedAt: string;
  readonly lastMentionedAt: string | null;
  readonly mentionCount: number;
}

export interface Relation {
  readonly id: string;
  readonly fromEntityId: string;
  readonly toEntityId: string;
  readonly type: string;
  readonly strength: number;
  readonly context: string | null;
  readonly firstSeenAt: string;
  readonly lastUpdatedAt: string;
}

export interface Event {
  readonly id: string;
  readonly source: string;
  readonly eventType: string;
  readonly contentHash: string | null;
  readonly parsedData: Record<string, unknown> | null;
  readonly entityIds: string[] | null;
  readonly timestamp: string;
  readonly processedAt: string | null;
  readonly importance: number;
}

export interface Observation {
  readonly id: string;
  readonly type: ObservationType;
  readonly content: string;
  readonly confidence: number;
  readonly sourceEventIds: string[] | null;
  readonly entityIds: string[] | null;
  readonly createdAt: string;
  readonly validatedAt: string | null;
  readonly expiresAt: string | null;
}

export interface Task {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly status: string;
  readonly priority: string;
  readonly entityIds: string[] | null;
  readonly scheduledFor: string | null;
  readonly completedAt: string | null;
  readonly createdAt: string;
}
