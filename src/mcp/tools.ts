import { z } from 'zod';
import { deepSanitizeStrings } from '../security/sanitize.js';

const querySchema = z.object({
  query: z.string().min(1).max(2000),
});

const getEntitySchema = z.object({
  name: z.string().min(1).max(200),
});

const searchSchema = z.object({
  query: z.string().min(1).max(500),
  limit: z.number().int().min(1).max(50).default(10),
});

const getUpcomingSchema = z.object({
  hours: z.number().int().min(1).max(720).default(24),
});

const getInsightsSchema = z.object({
  entityName: z.string().min(1).max(200).optional(),
  limit: z.number().int().min(1).max(20).default(5),
});

const getContextForSchema = z.object({
  topic: z.string().min(1).max(500),
});

const addEventSchema = z.object({
  sourceType: z.string().min(1).max(50),
  eventType: z.string().min(1).max(50),
  title: z.string().min(1).max(500),
  content: z.string().min(1).max(10000),
  timestamp: z.string().datetime().optional(),
  entityNames: z.array(z.string().max(200)).max(20).optional(),
});

const entityTypeEnum = z.enum([
  'person',
  'project',
  'company',
  'event',
  'document',
  'goal',
  'place',
  'concept',
]);

const rememberSchema = z.object({
  entities: z
    .array(
      z.object({
        name: z.string().min(1).max(200),
        type: entityTypeEnum,
        summary: z.string().max(1000).optional(),
        properties: z.record(z.string().max(500)).optional(),
      }),
    )
    .min(1)
    .max(30),
  relations: z
    .array(
      z.object({
        from: z.string().min(1).max(200),
        to: z.string().min(1).max(200),
        type: z.string().min(1).max(100),
        context: z.string().max(500).optional(),
      }),
    )
    .max(50)
    .default([]),
});

export const TOOL_DEFS = {
  openwind_query: {
    description: 'Ask a natural language question about your world model',
    schema: querySchema,
  },
  openwind_get_entity: {
    description:
      'Get detailed information about a specific entity including relations and timeline',
    schema: getEntitySchema,
  },
  openwind_search: {
    description: 'Search the world model using hybrid semantic + keyword search',
    schema: searchSchema,
  },
  openwind_get_upcoming: {
    description: 'Get upcoming deadlines, meetings, and events',
    schema: getUpcomingSchema,
  },
  openwind_get_insights: {
    description: 'Get recent AI-generated insights and observations',
    schema: getInsightsSchema,
  },
  openwind_get_context_for: {
    description: 'Get comprehensive context dump for a topic or entity',
    schema: getContextForSchema,
  },
  openwind_add_event: {
    description: 'Feed a new event into the world model (requires authorization)',
    schema: addEventSchema,
  },
  openwind_remember: {
    description:
      'Store structured knowledge: entities (people, projects, companies, etc.) and their relations. Use this whenever you learn something new about the user or their world.',
    schema: rememberSchema,
  },
} as const;

export type ToolName = keyof typeof TOOL_DEFS;

export function validateToolInput<T extends ToolName>(
  toolName: T,
  params: unknown,
): z.infer<(typeof TOOL_DEFS)[T]['schema']> {
  const sanitized = deepSanitizeStrings(params);
  const schema = TOOL_DEFS[toolName].schema;
  return schema.parse(sanitized) as z.infer<(typeof TOOL_DEFS)[T]['schema']>;
}
