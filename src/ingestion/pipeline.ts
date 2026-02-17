import { nanoid } from 'nanoid';
import type BetterSqlite3 from 'better-sqlite3';
import type { RateLimiter } from '../security/rate-limiter.js';
import type { AuditLogger } from '../security/audit.js';
import type { ModelRouter } from '../ai/router.js';
import type { ExtractionResult } from '../ai/anti-injection.js';
import { extractEntities } from '../ai/extract.js';
import { upsertEntity, upsertRelation, recordEvent } from '../db/world-model.js';
import { contentHash, isDuplicate } from './dedup.js';
import { normalizeRawEvent } from './normalizer.js';
import { resolveEntity, mergeProperties } from './resolver.js';

export class RateLimitExceededError extends Error {
  override readonly name = 'RateLimitExceededError';

  constructor() {
    super('Ingestion rate limit exceeded');
  }
}

export class IngestPipeline {
  constructor(
    private readonly db: BetterSqlite3.Database,
    private readonly router: ModelRouter,
    private readonly audit: AuditLogger,
    private readonly rateLimiter: RateLimiter,
  ) {}

  async ingestEvent(source: string, rawData: Record<string, unknown>): Promise<void> {
    if (!this.rateLimiter.tryConsume()) {
      throw new RateLimitExceededError();
    }

    const normalized = normalizeRawEvent(source, rawData);

    const hash = contentHash(normalized.content);
    if (isDuplicate(this.db, hash)) {
      this.audit.logAction('ingestion:dedup_skip', {
        source,
        hash,
      });
      return;
    }

    const extraction = await extractEntities(this.router, normalized.content);

    const entityIdMap = this.resolveAllEntities(extraction);
    const entityIds = [...entityIdMap.values()];

    this.upsertAllEntities(extraction, entityIdMap);
    this.upsertAllRelations(extraction, entityIdMap);

    const eventId = nanoid();
    recordEvent(this.db, {
      id: eventId,
      source: normalized.source,
      eventType: normalized.eventType,
      contentHash: hash,
      parsedData: { ...normalized.metadata },
      entityIds,
      timestamp: normalized.timestamp,
    });

    this.audit.logAction('ingestion:event_recorded', {
      eventId,
      source,
      entityCount: extraction.entities.length,
      relationCount: extraction.relations.length,
    });
  }

  private resolveAllEntities(extraction: ExtractionResult): Map<string, string> {
    const idMap = new Map<string, string>();

    for (const entity of extraction.entities) {
      const resolvedId = resolveEntity(this.db, {
        name: entity.name,
        type: entity.type,
        properties: entity.properties,
      });
      idMap.set(entity.name, resolvedId);
    }

    return idMap;
  }

  private upsertAllEntities(extraction: ExtractionResult, entityIdMap: Map<string, string>): void {
    for (const entity of extraction.entities) {
      const id = entityIdMap.get(entity.name);
      if (id === undefined) {
        continue;
      }

      const existing = this.db.prepare('SELECT properties FROM entities WHERE id = ?').get(id) as
        | { properties: string | null }
        | undefined;

      const existingProps = existing?.properties
        ? (JSON.parse(existing.properties) as Record<string, string>)
        : null;

      const merged = mergeProperties(existingProps, entity.properties);

      upsertEntity(this.db, {
        id,
        type: entity.type,
        name: entity.name,
        properties: merged,
      });
    }
  }

  private upsertAllRelations(extraction: ExtractionResult, entityIdMap: Map<string, string>): void {
    for (const relation of extraction.relations) {
      const fromId = entityIdMap.get(relation.from);
      const toId = entityIdMap.get(relation.to);
      if (fromId === undefined || toId === undefined) {
        continue;
      }

      upsertRelation(this.db, {
        id: nanoid(),
        fromEntityId: fromId,
        toEntityId: toId,
        type: relation.type,
        context: relation.context,
      });
    }
  }
}
