import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ingestManualInput } from '../sources/manual.js';

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
}));

vi.mock('../dedup.js', () => ({
  contentHash: vi.fn(() => 'hash-manual'),
  isDuplicate: vi.fn(() => false),
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

vi.mock('../../security/sanitize.js', () => ({
  sanitizeChannelInput: vi.fn((input: string) => input.trim()),
}));

import { extractEntities } from '../../ai/extract.js';
import { upsertEntity, upsertRelation, recordEvent } from '../../db/world-model.js';
import { isDuplicate } from '../dedup.js';
import { resolveEntity } from '../resolver.js';
import { sanitizeChannelInput } from '../../security/sanitize.js';

const mockExtract = vi.mocked(extractEntities);
const mockIsDuplicate = vi.mocked(isDuplicate);
const mockUpsertEntity = vi.mocked(upsertEntity);
const mockUpsertRelation = vi.mocked(upsertRelation);
const mockRecordEvent = vi.mocked(recordEvent);
const mockResolveEntity = vi.mocked(resolveEntity);
const mockSanitize = vi.mocked(sanitizeChannelInput);

function createMockDeps() {
  const db = {
    prepare: vi.fn(() => ({
      get: vi.fn(() => undefined),
    })),
  } as unknown as Parameters<typeof ingestManualInput>[0];

  const router = {} as Parameters<typeof ingestManualInput>[1];
  const audit = {
    logAction: vi.fn(),
  } as unknown as Parameters<typeof ingestManualInput>[2];

  return { db, router, audit };
}

describe('ingestManualInput', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sanitizes input before processing', async () => {
    const { db, router, audit } = createMockDeps();
    await ingestManualInput(db, router, audit, '  raw input  ');

    expect(mockSanitize).toHaveBeenCalledWith('  raw input  ');
  });

  it('skips duplicate content and logs audit', async () => {
    mockIsDuplicate.mockReturnValue(true);
    const { db, router, audit } = createMockDeps();

    await ingestManualInput(db, router, audit, 'duplicate');

    expect(mockRecordEvent).not.toHaveBeenCalled();
    expect(audit.logAction).toHaveBeenCalledWith('manual:dedup_skip', expect.any(Object));
  });

  it('extracts entities and upserts them', async () => {
    mockIsDuplicate.mockReturnValue(false);
    mockExtract.mockResolvedValue({
      entities: [
        { name: 'Alice', type: 'person', properties: { role: 'CEO' } },
      ],
      relations: [],
      facts: [],
    });
    mockResolveEntity.mockReturnValue('ent-alice');

    const { db, router, audit } = createMockDeps();
    await ingestManualInput(db, router, audit, 'Alice is the CEO');

    expect(mockUpsertEntity).toHaveBeenCalledOnce();
  });

  it('upserts relations between extracted entities', async () => {
    mockIsDuplicate.mockReturnValue(false);
    mockExtract.mockResolvedValue({
      entities: [
        { name: 'Alice', type: 'person' },
        { name: 'Bob', type: 'person' },
      ],
      relations: [
        { from: 'Alice', to: 'Bob', type: 'manages', context: 'Direct report' },
      ],
      facts: [],
    });
    mockResolveEntity.mockImplementation((_db, input) => {
      const extracted = input as { name: string };
      return extracted.name === 'Alice' ? 'ent-alice' : 'ent-bob';
    });

    const { db, router, audit } = createMockDeps();
    await ingestManualInput(db, router, audit, 'Alice manages Bob');

    expect(mockUpsertRelation).toHaveBeenCalledOnce();
    expect(mockUpsertRelation.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        fromEntityId: 'ent-alice',
        toEntityId: 'ent-bob',
        type: 'manages',
      }),
    );
  });

  it('skips relations when entity IDs are not resolved', async () => {
    mockIsDuplicate.mockReturnValue(false);
    mockExtract.mockResolvedValue({
      entities: [{ name: 'Alice', type: 'person' }],
      relations: [
        { from: 'Alice', to: 'Unknown', type: 'knows' },
      ],
      facts: [],
    });
    mockResolveEntity.mockReturnValue('ent-alice');

    const { db, router, audit } = createMockDeps();
    await ingestManualInput(db, router, audit, 'test');

    expect(mockUpsertRelation).not.toHaveBeenCalled();
  });

  it('records event with source "manual" and type "teach"', async () => {
    mockIsDuplicate.mockReturnValue(false);
    mockExtract.mockResolvedValue({ entities: [], relations: [], facts: [] });

    const { db, router, audit } = createMockDeps();
    await ingestManualInput(db, router, audit, 'some knowledge');

    expect(mockRecordEvent).toHaveBeenCalledOnce();
    expect(mockRecordEvent.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        source: 'manual',
        eventType: 'teach',
      }),
    );
  });

  it('logs audit after successful ingestion', async () => {
    mockIsDuplicate.mockReturnValue(false);
    mockExtract.mockResolvedValue({
      entities: [{ name: 'X', type: 'concept' }],
      relations: [],
      facts: [],
    });

    const { db, router, audit } = createMockDeps();
    await ingestManualInput(db, router, audit, 'teach something');

    expect(audit.logAction).toHaveBeenCalledWith(
      'manual:event_recorded',
      expect.objectContaining({
        entityCount: 1,
        relationCount: 0,
      }),
    );
  });
});
