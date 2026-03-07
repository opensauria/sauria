import type BetterSqlite3 from 'better-sqlite3';
import type { ModelRouter } from '../ai/router.js';
import { reasonAbout } from '../ai/reason.js';
import type { AuditLogger } from '../security/audit.js';
import {
  getEntityByName,
  getEntityRelations,
  getEntityTimeline,
  searchEntities,
} from '../db/world-model.js';
import { getUpcomingDeadlines } from '../db/temporal.js';
import { hybridSearch } from '../db/search.js';
import { validateToolInput } from './tools.js';
import type { ToolName } from './tools.js';
import { textResult, formatEntity, isObservationRow } from './server-helpers.js';

interface ToolDeps {
  readonly db: BetterSqlite3.Database;
  readonly router: ModelRouter;
  readonly audit: AuditLogger;
  readonly guardRateLimit: (toolName: ToolName) => void;
  readonly auditToolCall: (toolName: ToolName, params: unknown) => void;
}

type ToolHandler = (raw: Record<string, unknown>) => Promise<{ content: { type: 'text'; text: string }[] }>;

export function createQueryHandler(deps: ToolDeps): ToolHandler {
  const { db, router, guardRateLimit, auditToolCall } = deps;
  return async (raw) => {
    guardRateLimit('sauria_query');
    const { query } = validateToolInput('sauria_query', raw);
    auditToolCall('sauria_query', raw);
    const entities = searchEntities(db, query);
    const context = entities.map(formatEntity).join('\n\n');
    return textResult(await reasonAbout(router, context, query));
  };
}

export function createGetEntityHandler(deps: ToolDeps): ToolHandler {
  const { db, guardRateLimit, auditToolCall } = deps;
  return async (raw) => {
    guardRateLimit('sauria_get_entity');
    const { name } = validateToolInput('sauria_get_entity', raw);
    auditToolCall('sauria_get_entity', raw);
    const entity = getEntityByName(db, name);
    if (!entity) return textResult(`Entity "${name}" not found.`);
    const relations = getEntityRelations(db, entity.id);
    const timeline = getEntityTimeline(db, entity.id, 20);
    const relLines = relations.map((r) => {
      const isSource = r.fromEntityId === entity.id;
      return `  ${isSource ? '->' : '<-'} [${r.type}] ${isSource ? r.toEntityId : r.fromEntityId} (strength: ${r.strength})`;
    });
    const eventLines = timeline.map((e) => `  [${e.timestamp}] ${e.eventType}: ${e.source}`);
    const output = [
      formatEntity(entity),
      relations.length > 0 ? `\nRelations:\n${relLines.join('\n')}` : '',
      timeline.length > 0 ? `\nTimeline:\n${eventLines.join('\n')}` : '',
    ]
      .filter(Boolean)
      .join('\n');
    return textResult(output);
  };
}

export function createSearchHandler(deps: ToolDeps): ToolHandler {
  const { db, guardRateLimit, auditToolCall } = deps;
  return async (raw) => {
    guardRateLimit('sauria_search');
    const { query, limit } = validateToolInput('sauria_search', raw);
    auditToolCall('sauria_search', raw);
    const results = hybridSearch(db, query, null, limit);
    if (results.length === 0) return textResult('No results found.');
    return textResult(results.map((e, i) => `${i + 1}. ${formatEntity(e)}`).join('\n\n'));
  };
}

export function createUpcomingHandler(deps: ToolDeps): ToolHandler {
  const { db, guardRateLimit, auditToolCall } = deps;
  return async (raw) => {
    guardRateLimit('sauria_get_upcoming');
    const { hours } = validateToolInput('sauria_get_upcoming', raw);
    auditToolCall('sauria_get_upcoming', raw);
    const events = getUpcomingDeadlines(db, hours);
    if (events.length === 0) return textResult(`No upcoming events in the next ${hours} hours.`);
    const lines = events.map(
      (e) => `[${e.timestamp}] ${e.eventType} (${e.source}) - importance: ${e.importance}`,
    );
    return textResult(lines.join('\n'));
  };
}

export function createInsightsHandler(deps: ToolDeps): ToolHandler {
  const { db, guardRateLimit, auditToolCall } = deps;
  return async (raw) => {
    guardRateLimit('sauria_get_insights');
    const { entityName, limit } = validateToolInput('sauria_get_insights', raw);
    auditToolCall('sauria_get_insights', raw);
    let rows: unknown[];
    if (entityName) {
      const entity = getEntityByName(db, entityName);
      if (!entity) return textResult(`Entity "${entityName}" not found.`);
      rows = db
        .prepare(
          "SELECT o.* FROM observations o, json_each(o.entity_ids) j WHERE o.type = 'insight' AND j.value = ? ORDER BY o.created_at DESC LIMIT ?",
        )
        .all(entity.id, limit);
      if (rows.length === 0) {
        rows = db
          .prepare(
            "SELECT * FROM observations WHERE type = 'insight' ORDER BY created_at DESC LIMIT ?",
          )
          .all(limit);
      }
    } else {
      rows = db
        .prepare(
          "SELECT * FROM observations WHERE type = 'insight' ORDER BY created_at DESC LIMIT ?",
        )
        .all(limit);
    }
    if (rows.length === 0) return textResult('No insights generated yet.');
    const lines = rows
      .filter(isObservationRow)
      .map(
        (r) =>
          `[${String(r['created_at'])}] (confidence: ${String(r['confidence'])}) ${String(r['content'])}`,
      );
    return textResult(lines.join('\n\n'));
  };
}

export function createContextHandler(deps: ToolDeps): ToolHandler {
  const { db, guardRateLimit, auditToolCall } = deps;
  return async (raw) => {
    guardRateLimit('sauria_get_context_for');
    const { topic } = validateToolInput('sauria_get_context_for', raw);
    auditToolCall('sauria_get_context_for', raw);
    const entities = hybridSearch(db, topic, null, 10);
    const sections: string[] = [`Context for: ${topic}\n`];
    for (const entity of entities) {
      sections.push(formatEntity(entity));
      const relations = getEntityRelations(db, entity.id);
      if (relations.length > 0) {
        sections.push('Relations:');
        for (const r of relations.slice(0, 10)) {
          sections.push(
            `  [${r.type}] ${r.fromEntityId} -> ${r.toEntityId} (strength: ${r.strength})`,
          );
        }
      }
      const timeline = getEntityTimeline(db, entity.id, 5);
      if (timeline.length > 0) {
        sections.push('Recent events:');
        for (const e of timeline) {
          sections.push(`  [${e.timestamp}] ${e.eventType}: ${e.source}`);
        }
      }
      sections.push('');
    }
    if (entities.length === 0) sections.push('No matching entities found.');
    return textResult(sections.join('\n'));
  };
}

