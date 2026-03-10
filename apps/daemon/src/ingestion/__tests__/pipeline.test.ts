import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IngestPipeline, RateLimitExceededError } from '../pipeline.js';

vi.mock('../../ai/extract.js', () => ({
  extractEntities: vi.fn(async () => ({
    entities: [],
    relations: [],
    facts: [],
  })),
}));

vi.mock('../../db/world-model.js', () => ({
  upsertEntity: vi.fn(),
  upsertRelation: vi.fn(),
  recordEvent: vi.fn(),
  addObservation: vi.fn(),
}));

vi.mock('../dedup.js', () => ({
  contentHash: vi.fn(() => 'hash-abc'),
  isDuplicate: vi.fn(() => false),
}));

vi.mock('../normalizer.js', () => ({
  normalizeRawEvent: vi.fn((source: string, raw: Record<string, unknown>) => ({
    source,
    eventType: (raw['type'] as string) ?? 'unknown',
    content: (raw['body'] as string) ?? '',
    metadata: {},
    timestamp: new Date().toISOString(),
  })),
}));

vi.mock('../resolver.js', () => ({
  resolveEntity: vi.fn(() => 'resolved-id'),
  mergeProperties: vi.fn(
    (existing: Record<string, string> | null, incoming: Record<string, string> | undefined) => ({
      ...existing,
      ...incoming,
    }),
  ),
}));

import { extractEntities } from '../../ai/extract.js';
import { upsertEntity, upsertRelation, recordEvent, addObservation } from '../../db/world-model.js';
import { isDuplicate } from '../dedup.js';
import { resolveEntity } from '../resolver.js';

const mockExtract = vi.mocked(extractEntities);
const mockIsDuplicate = vi.mocked(isDuplicate);
const mockUpsertEntity = vi.mocked(upsertEntity);
const mockUpsertRelation = vi.mocked(upsertRelation);
const mockRecordEvent = vi.mocked(recordEvent);
const mockAddObservation = vi.mocked(addObservation);
const mockResolveEntity = vi.mocked(resolveEntity);

function createPipeline(rateLimitOk = true) {
  const db = {
    prepare: vi.fn(() => ({
      get: vi.fn(() => undefined),
    })),
  } as unknown as ConstructorParameters<typeof IngestPipeline>[0];

  const router = {} as ConstructorParameters<typeof IngestPipeline>[1];
  const audit = { logAction: vi.fn() } as unknown as ConstructorParameters<
    typeof IngestPipeline
  >[2];
  const rateLimiter = {
    tryConsume: vi.fn(() => rateLimitOk),
  } as unknown as ConstructorParameters<typeof IngestPipeline>[3];

  return { pipeline: new IngestPipeline(db, router, audit, rateLimiter), db, audit, rateLimiter };
}

describe('IngestPipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws RateLimitExceededError when rate limiter denies', async () => {
    const { pipeline } = createPipeline(false);

    await expect(pipeline.ingestEvent('email', { body: 'hello' })).rejects.toThrow(
      RateLimitExceededError,
    );
  });

  it('skips duplicate events and logs audit', async () => {
    mockIsDuplicate.mockReturnValue(true);
    const { pipeline, audit } = createPipeline();

    await pipeline.ingestEvent('email', { body: 'duplicate content' });

    expect(mockRecordEvent).not.toHaveBeenCalled();
    expect(
      (audit as unknown as { logAction: ReturnType<typeof vi.fn> }).logAction,
    ).toHaveBeenCalledWith('ingestion:dedup_skip', expect.objectContaining({ source: 'email' }));
  });

  it('extracts entities, upserts them, and records event', async () => {
    mockIsDuplicate.mockReturnValue(false);
    mockExtract.mockResolvedValue({
      entities: [{ name: 'Alice', type: 'person', properties: { role: 'engineer' } }],
      relations: [],
      facts: [],
    });
    mockResolveEntity.mockReturnValue('ent-alice');

    const { pipeline } = createPipeline();
    await pipeline.ingestEvent('email', { body: 'Alice sent a message' });

    expect(mockUpsertEntity).toHaveBeenCalledOnce();
    expect(mockRecordEvent).toHaveBeenCalledOnce();
  });

  it('upserts relations with resolved entity IDs', async () => {
    mockIsDuplicate.mockReturnValue(false);
    mockExtract.mockResolvedValue({
      entities: [
        { name: 'Alice', type: 'person' },
        { name: 'Bob', type: 'person' },
      ],
      relations: [{ from: 'Alice', to: 'Bob', type: 'works_with', context: 'Same team' }],
      facts: [],
    });
    mockResolveEntity.mockImplementation((_db, input) => {
      const extracted = input as { name: string };
      return extracted.name === 'Alice' ? 'ent-alice' : 'ent-bob';
    });

    const { pipeline } = createPipeline();
    await pipeline.ingestEvent('manual', { body: 'Alice works with Bob' });

    expect(mockUpsertRelation).toHaveBeenCalledOnce();
    expect(mockUpsertRelation.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        fromEntityId: 'ent-alice',
        toEntityId: 'ent-bob',
        type: 'works_with',
      }),
    );
  });

  it('skips relations when entity IDs cannot be resolved', async () => {
    mockIsDuplicate.mockReturnValue(false);
    mockExtract.mockResolvedValue({
      entities: [{ name: 'Alice', type: 'person' }],
      relations: [{ from: 'Alice', to: 'Unknown', type: 'knows' }],
      facts: [],
    });
    mockResolveEntity.mockReturnValue('ent-alice');

    const { pipeline } = createPipeline();
    await pipeline.ingestEvent('email', { body: 'test' });

    // 'Unknown' has no entity, so relation from->to resolution fails for 'to'
    // resolveEntity is only called for extraction.entities, not for relation targets
    // So entityIdMap won't have 'Unknown'
    expect(mockUpsertRelation).not.toHaveBeenCalled();
  });

  it('creates observations from facts', async () => {
    mockIsDuplicate.mockReturnValue(false);
    mockExtract.mockResolvedValue({
      entities: [],
      relations: [],
      facts: [
        { fact: 'Important discovery', importance: 0.9 },
        { fact: '   ', importance: 0.1 },
      ],
    });

    const { pipeline } = createPipeline();
    await pipeline.ingestEvent('manual', { body: 'discovery' });

    // Empty fact (whitespace only) should be skipped
    expect(mockAddObservation).toHaveBeenCalledOnce();
    expect(mockAddObservation.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        content: 'Important discovery',
        confidence: 0.9,
      }),
    );
  });

  it('logs audit event after successful ingestion', async () => {
    mockIsDuplicate.mockReturnValue(false);
    mockExtract.mockResolvedValue({ entities: [], relations: [], facts: [] });

    const { pipeline, audit } = createPipeline();
    await pipeline.ingestEvent('telegram', { body: 'hello' });

    expect(
      (audit as unknown as { logAction: ReturnType<typeof vi.fn> }).logAction,
    ).toHaveBeenCalledWith(
      'ingestion:event_recorded',
      expect.objectContaining({
        source: 'telegram',
        entityCount: 0,
        relationCount: 0,
      }),
    );
  });
});

describe('RateLimitExceededError', () => {
  it('has correct name and message', () => {
    const error = new RateLimitExceededError();
    expect(error.name).toBe('RateLimitExceededError');
    expect(error.message).toBe('Ingestion rate limit exceeded');
  });
});
