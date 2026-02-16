import { nanoid } from 'nanoid';
import type BetterSqlite3 from 'better-sqlite3';
import type { ModelRouter } from '../../ai/router.js';
import type { AuditLogger } from '../../security/audit.js';
import { sanitizeChannelInput } from '../../security/sanitize.js';
import { extractEntities } from '../../ai/extract.js';
import { upsertEntity, upsertRelation, recordEvent } from '../../db/world-model.js';
import { contentHash, isDuplicate } from '../dedup.js';
import { resolveEntity, mergeProperties } from '../resolver.js';

export async function ingestManualInput(
  db: BetterSqlite3.Database,
  router: ModelRouter,
  audit: AuditLogger,
  input: string,
): Promise<void> {
  const sanitized = sanitizeChannelInput(input);

  const hash = contentHash(sanitized);
  if (isDuplicate(db, hash)) {
    audit.logAction('manual:dedup_skip', { hash });
    return;
  }

  const extraction = await extractEntities(router, sanitized);

  const entityIdMap = new Map<string, string>();
  for (const entity of extraction.entities) {
    const resolvedId = resolveEntity(db, {
      name: entity.name,
      type: entity.type,
      properties: entity.properties,
    });
    entityIdMap.set(entity.name, resolvedId);
  }

  for (const entity of extraction.entities) {
    const id = entityIdMap.get(entity.name);
    if (id === undefined) {
      continue;
    }

    const existing = db
      .prepare('SELECT properties FROM entities WHERE id = ?')
      .get(id) as { properties: string | null } | undefined;

    const existingProps = existing?.properties
      ? (JSON.parse(existing.properties) as Record<string, string>)
      : null;

    const merged = mergeProperties(existingProps, entity.properties);

    upsertEntity(db, {
      id,
      type: entity.type,
      name: entity.name,
      properties: merged,
    });
  }

  for (const relation of extraction.relations) {
    const fromId = entityIdMap.get(relation.from);
    const toId = entityIdMap.get(relation.to);
    if (fromId === undefined || toId === undefined) {
      continue;
    }

    upsertRelation(db, {
      id: nanoid(),
      fromEntityId: fromId,
      toEntityId: toId,
      type: relation.type,
      context: relation.context,
    });
  }

  const entityIds = [...entityIdMap.values()];
  const eventId = nanoid();

  recordEvent(db, {
    id: eventId,
    source: 'manual',
    eventType: 'teach',
    contentHash: hash,
    parsedData: {},
    entityIds,
    timestamp: new Date().toISOString(),
  });

  audit.logAction('manual:event_recorded', {
    eventId,
    entityCount: extraction.entities.length,
    relationCount: extraction.relations.length,
  });
}
