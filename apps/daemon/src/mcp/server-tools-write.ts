import type BetterSqlite3 from 'better-sqlite3';
import { nanoid } from 'nanoid';
import type { AuditLogger } from '../security/audit.js';
import {
  getEntityByName,
  recordEvent,
  upsertEntity,
  upsertRelation,
} from '../db/world-model.js';
import { resolveEntity } from '../ingestion/resolver.js';
import { validateToolInput } from './tools.js';
import type { ToolName } from './tools.js';
import { textResult } from './server-helpers.js';

interface ToolDeps {
  readonly db: BetterSqlite3.Database;
  readonly audit: AuditLogger;
  readonly guardRateLimit: (toolName: ToolName) => void;
  readonly auditToolCall: (toolName: ToolName, params: unknown) => void;
}

type ToolHandler = (raw: Record<string, unknown>) => Promise<{ content: { type: 'text'; text: string }[] }>;

export function createAddEventHandler(deps: ToolDeps): ToolHandler {
  const { db, guardRateLimit, auditToolCall } = deps;
  return async (raw) => {
    guardRateLimit('sauria_add_event');
    const input = validateToolInput('sauria_add_event', raw);
    auditToolCall('sauria_add_event', raw);
    const eventId = nanoid();
    const contentHash = deps.audit.hashContent(input.content);
    const entityIds = input.entityNames
      ?.map((n) => getEntityByName(db, n)?.id)
      .filter((id): id is string => id !== undefined);
    recordEvent(db, {
      id: eventId,
      source: input.sourceType,
      eventType: input.eventType,
      contentHash,
      parsedData: { title: input.title, content: input.content },
      entityIds,
      timestamp: input.timestamp ?? new Date().toISOString(),
    });
    return textResult(`Event recorded: ${eventId}`);
  };
}

export function createRememberHandler(deps: ToolDeps): ToolHandler {
  const { db, guardRateLimit, auditToolCall } = deps;
  return async (raw) => {
    guardRateLimit('sauria_remember');
    const { entities, relations } = validateToolInput('sauria_remember', raw);
    auditToolCall('sauria_remember', raw);

    const entityIdMap = new Map<string, string>();

    for (const entity of entities) {
      const id = resolveEntity(db, {
        name: entity.name,
        type: entity.type,
        properties: entity.properties,
      });
      entityIdMap.set(entity.name, id);
      upsertEntity(db, {
        id,
        type: entity.type,
        name: entity.name,
        summary: entity.summary,
        properties: entity.properties,
      });
    }

    let relCount = 0;
    for (const rel of relations) {
      const fromId = entityIdMap.get(rel.from);
      const toId = entityIdMap.get(rel.to);
      if (!fromId || !toId) continue;
      upsertRelation(db, {
        id: nanoid(),
        fromEntityId: fromId,
        toEntityId: toId,
        type: rel.type,
        context: rel.context,
      });
      relCount++;
    }

    return textResult(
      `Remembered ${entities.length} entit${entities.length === 1 ? 'y' : 'ies'}` +
        (relCount > 0 ? ` and ${relCount} relation${relCount === 1 ? '' : 's'}` : '') +
        '.',
    );
  };
}
