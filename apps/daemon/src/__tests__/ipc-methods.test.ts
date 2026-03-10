import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildMethodMap } from '../ipc-methods.js';

const mockListEntities = vi.fn().mockReturnValue([]);
const mockDeleteConversation = vi.fn().mockReturnValue({ success: true });
const mockDeleteRow = vi.fn().mockReturnValue({ success: true });

vi.mock('../db/brain-queries.js', () => ({
  listEntities: (...args: unknown[]) => mockListEntities(...args),
  getEntityDetail: vi.fn().mockReturnValue(null),
  listRelations: vi.fn().mockReturnValue([]),
  listObservations: vi.fn().mockReturnValue([]),
  listEvents: vi.fn().mockReturnValue([]),
  listConversations: vi.fn().mockReturnValue([]),
  getConversationMessages: vi.fn().mockReturnValue([]),
  listFacts: vi.fn().mockReturnValue([]),
  getStats: vi.fn().mockReturnValue({ entities: 0 }),
  deleteRow: (...args: unknown[]) => mockDeleteRow(...args),
  deleteConversation: (...args: unknown[]) => mockDeleteConversation(...args),
  updateEntity: vi.fn().mockReturnValue({ success: true }),
}));

vi.mock('../ai/extract.js', () => ({
  getExtractionFailureCount: vi.fn().mockReturnValue(0),
}));

describe('buildMethodMap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a Map with expected brain methods', () => {
    const methods = buildMethodMap();

    expect(methods).toBeInstanceOf(Map);
    expect(methods.has('brain:list-entities')).toBe(true);
    expect(methods.has('brain:get-entity')).toBe(true);
    expect(methods.has('brain:list-relations')).toBe(true);
    expect(methods.has('brain:list-observations')).toBe(true);
    expect(methods.has('brain:list-events')).toBe(true);
    expect(methods.has('brain:list-conversations')).toBe(true);
    expect(methods.has('brain:get-conversation')).toBe(true);
    expect(methods.has('brain:list-facts')).toBe(true);
    expect(methods.has('brain:get-stats')).toBe(true);
    expect(methods.has('brain:delete')).toBe(true);
    expect(methods.has('brain:update-entity')).toBe(true);
    expect(methods.has('kpi:get')).toBe(true);
  });

  it('brain:list-entities calls listEntities with params', () => {
    const methods = buildMethodMap();
    const handler = methods.get('brain:list-entities')!;
    const db = {} as never;
    handler(db, { type: 'person' });

    expect(mockListEntities).toHaveBeenCalledWith(db, { type: 'person' });
  });

  it('brain:delete routes agent_conversations to deleteConversation', () => {
    const methods = buildMethodMap();
    const handler = methods.get('brain:delete')!;
    const db = {} as never;
    handler(db, { table: 'agent_conversations', id: 'conv-1' });

    expect(mockDeleteConversation).toHaveBeenCalledWith(db, 'conv-1');
  });

  it('brain:delete routes other tables to deleteRow', () => {
    const methods = buildMethodMap();
    const handler = methods.get('brain:delete')!;
    const db = {} as never;
    handler(db, { table: 'entities', id: 'ent-1' });

    expect(mockDeleteRow).toHaveBeenCalledWith(db, 'entities', 'ent-1');
  });

  it('kpi:get returns zero defaults when no row found', () => {
    const methods = buildMethodMap();
    const handler = methods.get('kpi:get')!;
    const mockDb = {
      prepare: vi.fn().mockReturnValue({
        get: vi.fn().mockReturnValue(undefined),
      }),
    } as never;

    const result = handler(mockDb, { nodeId: 'node-1' });

    expect(result).toEqual({
      messagesHandled: 0,
      tasksCompleted: 0,
      avgResponseTimeMs: 0,
      costUsd: 0,
    });
  });

  it('kpi:get computes avg response time and rounds cost', () => {
    const methods = buildMethodMap();
    const handler = methods.get('kpi:get')!;
    const mockDb = {
      prepare: vi.fn().mockReturnValue({
        get: vi.fn().mockReturnValue({
          messages_handled: 10,
          tasks_completed: 5,
          total_response_time_ms: 5000,
          cost_incurred_usd: 0.12345,
        }),
      }),
    } as never;

    const result = handler(mockDb, { nodeId: 'node-1' }) as Record<string, number>;

    expect(result.messagesHandled).toBe(10);
    expect(result.tasksCompleted).toBe(5);
    expect(result.avgResponseTimeMs).toBe(500);
    expect(result.costUsd).toBe(0.12);
  });

  it('kpi:get handles zero messages_handled for avg', () => {
    const methods = buildMethodMap();
    const handler = methods.get('kpi:get')!;
    const mockDb = {
      prepare: vi.fn().mockReturnValue({
        get: vi.fn().mockReturnValue({
          messages_handled: 0,
          tasks_completed: 0,
          total_response_time_ms: 0,
          cost_incurred_usd: 0,
        }),
      }),
    } as never;

    const result = handler(mockDb, { nodeId: 'node-1' }) as Record<string, number>;
    expect(result.avgResponseTimeMs).toBe(0);
  });

  it('brain:get-entity forwards id param', async () => {
    const methods = buildMethodMap();
    const handler = methods.get('brain:get-entity')!;
    const db = {} as never;
    handler(db, { id: 'ent-42' });

    const mod = await import('../db/brain-queries.js');
    expect(mod.getEntityDetail).toHaveBeenCalledWith(db, 'ent-42');
  });

  it('brain:list-relations forwards params', async () => {
    const methods = buildMethodMap();
    const handler = methods.get('brain:list-relations')!;
    const db = {} as never;
    handler(db, { entityId: 'e1' });

    const mod = await import('../db/brain-queries.js');
    expect(mod.listRelations).toHaveBeenCalledWith(db, { entityId: 'e1' });
  });

  it('brain:list-observations forwards params', async () => {
    const methods = buildMethodMap();
    const handler = methods.get('brain:list-observations')!;
    const db = {} as never;
    handler(db, { entityId: 'e1' });

    const mod = await import('../db/brain-queries.js');
    expect(mod.listObservations).toHaveBeenCalledWith(db, { entityId: 'e1' });
  });

  it('brain:list-events forwards params', async () => {
    const methods = buildMethodMap();
    const handler = methods.get('brain:list-events')!;
    const db = {} as never;
    handler(db, { limit: 5 });

    const mod = await import('../db/brain-queries.js');
    expect(mod.listEvents).toHaveBeenCalledWith(db, { limit: 5 });
  });

  it('brain:list-conversations forwards params', async () => {
    const methods = buildMethodMap();
    const handler = methods.get('brain:list-conversations')!;
    const db = {} as never;
    handler(db, { nodeId: 'n1' });

    const mod = await import('../db/brain-queries.js');
    expect(mod.listConversations).toHaveBeenCalledWith(db, { nodeId: 'n1' });
  });

  it('brain:get-conversation forwards id and params', async () => {
    const methods = buildMethodMap();
    const handler = methods.get('brain:get-conversation')!;
    const db = {} as never;
    handler(db, { id: 'conv-1', limit: 10 });

    const mod = await import('../db/brain-queries.js');
    expect(mod.getConversationMessages).toHaveBeenCalledWith(db, 'conv-1', {
      id: 'conv-1',
      limit: 10,
    });
  });

  it('brain:list-facts forwards params', async () => {
    const methods = buildMethodMap();
    const handler = methods.get('brain:list-facts')!;
    const db = {} as never;
    handler(db, { nodeId: 'n1' });

    const mod = await import('../db/brain-queries.js');
    expect(mod.listFacts).toHaveBeenCalledWith(db, { nodeId: 'n1' });
  });

  it('brain:get-stats passes extraction failure count', async () => {
    const methods = buildMethodMap();
    const handler = methods.get('brain:get-stats')!;
    const db = {} as never;
    handler(db, {});

    const mod = await import('../db/brain-queries.js');
    expect(mod.getStats).toHaveBeenCalledWith(db, 0);
  });

  it('brain:update-entity forwards id and fields', async () => {
    const methods = buildMethodMap();
    const handler = methods.get('brain:update-entity')!;
    const db = {} as never;
    handler(db, { id: 'e1', fields: { name: 'Updated' } });

    const mod = await import('../db/brain-queries.js');
    expect(mod.updateEntity).toHaveBeenCalledWith(db, 'e1', { name: 'Updated' });
  });
});
