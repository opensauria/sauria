import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('nanoid', () => ({
  nanoid: vi.fn(() => 'mock-id'),
}));
vi.mock('../../db/world-model.js', () => ({
  getEntityByName: vi.fn(),
  recordEvent: vi.fn(),
  upsertEntity: vi.fn(),
  upsertRelation: vi.fn(),
}));
vi.mock('../../ingestion/resolver.js', () => ({
  resolveEntity: vi.fn(),
}));
vi.mock('../../security/sanitize.js', () => ({
  deepSanitizeStrings: vi.fn((v: unknown) => v),
}));

import { createAddEventHandler, createRememberHandler } from '../server-tools-write.js';
import {
  getEntityByName,
  recordEvent,
  upsertEntity,
  upsertRelation,
} from '../../db/world-model.js';
import { resolveEntity } from '../../ingestion/resolver.js';

const mockDb = {} as unknown as import('better-sqlite3').Database;

const mockAudit = {
  logAction: vi.fn(),
  hashContent: vi.fn(() => 'content-hash'),
} as unknown as import('../../security/audit.js').AuditLogger;

const guardRateLimit = vi.fn();
const auditToolCall = vi.fn();

const deps = {
  db: mockDb,
  audit: mockAudit,
  guardRateLimit,
  auditToolCall,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createAddEventHandler', () => {
  it('records an event and returns the id', async () => {
    const handler = createAddEventHandler(deps);
    const result = await handler({
      sourceType: 'manual',
      eventType: 'note',
      title: 'Test',
      content: 'Some content',
    });
    expect(guardRateLimit).toHaveBeenCalledWith('sauria_add_event');
    expect(auditToolCall).toHaveBeenCalledWith('sauria_add_event', expect.anything());
    expect(recordEvent).toHaveBeenCalledWith(
      mockDb,
      expect.objectContaining({
        id: 'mock-id',
        source: 'manual',
        eventType: 'note',
        contentHash: 'content-hash',
      }),
    );
    expect(result.content[0]?.text).toContain('mock-id');
  });

  it('resolves entity names to IDs', async () => {
    vi.mocked(getEntityByName)
      .mockReturnValueOnce({
        id: 'ent-1',
        type: 'person' as const,
        name: 'Alice',
        summary: null,
        properties: null,
        importanceScore: 1,
        firstSeenAt: '',
        lastUpdatedAt: '',
        lastMentionedAt: null,
        mentionCount: 0,
      })
      .mockReturnValueOnce(undefined);

    const handler = createAddEventHandler(deps);
    await handler({
      sourceType: 'manual',
      eventType: 'note',
      title: 'Test',
      content: 'content',
      entityNames: ['Alice', 'Unknown'],
    });

    expect(recordEvent).toHaveBeenCalledWith(
      mockDb,
      expect.objectContaining({ entityIds: ['ent-1'] }),
    );
  });

  it('uses provided timestamp', async () => {
    const handler = createAddEventHandler(deps);
    await handler({
      sourceType: 'manual',
      eventType: 'note',
      title: 'Test',
      content: 'content',
      timestamp: '2026-03-10T12:00:00Z',
    });
    expect(recordEvent).toHaveBeenCalledWith(
      mockDb,
      expect.objectContaining({ timestamp: '2026-03-10T12:00:00Z' }),
    );
  });
});

describe('createRememberHandler', () => {
  it('upserts entities and relations', async () => {
    vi.mocked(resolveEntity).mockReturnValueOnce('id-alice').mockReturnValueOnce('id-bob');
    const handler = createRememberHandler(deps);
    const result = await handler({
      entities: [
        { name: 'Alice', type: 'person' },
        { name: 'Bob', type: 'person' },
      ],
      relations: [{ from: 'Alice', to: 'Bob', type: 'knows' }],
    });
    expect(upsertEntity).toHaveBeenCalledTimes(2);
    expect(upsertRelation).toHaveBeenCalledTimes(1);
    expect(upsertRelation).toHaveBeenCalledWith(
      mockDb,
      expect.objectContaining({
        fromEntityId: 'id-alice',
        toEntityId: 'id-bob',
        type: 'knows',
      }),
    );
    expect(result.content[0]?.text).toContain('2 entities');
    expect(result.content[0]?.text).toContain('1 relation');
  });

  it('skips relations with unknown entity names', async () => {
    vi.mocked(resolveEntity).mockReturnValueOnce('id-alice');
    const handler = createRememberHandler(deps);
    const result = await handler({
      entities: [{ name: 'Alice', type: 'person' }],
      relations: [{ from: 'Alice', to: 'Unknown', type: 'knows' }],
    });
    expect(upsertRelation).not.toHaveBeenCalled();
    expect(result.content[0]?.text).not.toContain('relation');
  });

  it('uses singular entity text for single entity', async () => {
    vi.mocked(resolveEntity).mockReturnValueOnce('id-1');
    const handler = createRememberHandler(deps);
    const result = await handler({
      entities: [{ name: 'X', type: 'concept' }],
      relations: [],
    });
    expect(result.content[0]?.text).toBe('Remembered 1 entity.');
  });

  it('uses plural relations text', async () => {
    vi.mocked(resolveEntity)
      .mockReturnValueOnce('id-a')
      .mockReturnValueOnce('id-b')
      .mockReturnValueOnce('id-c');
    const handler = createRememberHandler(deps);
    const result = await handler({
      entities: [
        { name: 'A', type: 'person' },
        { name: 'B', type: 'person' },
        { name: 'C', type: 'person' },
      ],
      relations: [
        { from: 'A', to: 'B', type: 'knows' },
        { from: 'B', to: 'C', type: 'knows' },
      ],
    });
    expect(result.content[0]?.text).toContain('3 entities');
    expect(result.content[0]?.text).toContain('2 relations');
  });
});
