import type BetterSqlite3 from 'better-sqlite3';
import {
  listEntities,
  getEntityDetail,
  listRelations,
  listObservations,
  listEvents,
  listConversations,
  getConversationMessages,
  listFacts,
  getStats,
  deleteRow,
  deleteConversation,
  updateEntity,
} from './db/brain-queries.js';
import { getExtractionFailureCount } from './ai/extract.js';

export type MethodHandler = (
  db: BetterSqlite3.Database,
  params: Record<string, unknown>,
) => unknown | Promise<unknown>;

export function buildMethodMap(): Map<string, MethodHandler> {
  const methods = new Map<string, MethodHandler>();

  methods.set('brain:list-entities', (db, params) => listEntities(db, params));
  methods.set('brain:get-entity', (db, params) => getEntityDetail(db, params['id'] as string));
  methods.set('brain:list-relations', (db, params) => listRelations(db, params));
  methods.set('brain:list-observations', (db, params) => listObservations(db, params));
  methods.set('brain:list-events', (db, params) => listEvents(db, params));
  methods.set('brain:list-conversations', (db, params) => listConversations(db, params));
  methods.set('brain:get-conversation', (db, params) =>
    getConversationMessages(db, params['id'] as string, params),
  );
  methods.set('brain:list-facts', (db, params) => listFacts(db, params));
  methods.set('brain:get-stats', (db) => getStats(db, getExtractionFailureCount()));
  methods.set('brain:delete', (db, params) => {
    const table = params['table'] as string;
    const id = params['id'] as string;
    if (table === 'agent_conversations') {
      return deleteConversation(db, id);
    }
    return deleteRow(db, table, id);
  });
  methods.set('brain:update-entity', (db, params) =>
    updateEntity(db, params['id'] as string, params['fields'] as Record<string, unknown>),
  );

  methods.set('kpi:get', (db, params) => {
    const nodeId = params['nodeId'] as string;
    const row = db.prepare(`SELECT * FROM agent_performance WHERE node_id = ?`).get(nodeId) as
      | {
          messages_handled: number;
          tasks_completed: number;
          total_response_time_ms: number;
          cost_incurred_usd: number;
        }
      | undefined;

    if (!row) {
      return { messagesHandled: 0, tasksCompleted: 0, avgResponseTimeMs: 0, costUsd: 0 };
    }

    return {
      messagesHandled: row.messages_handled,
      tasksCompleted: row.tasks_completed,
      avgResponseTimeMs:
        row.messages_handled > 0
          ? Math.round(row.total_response_time_ms / row.messages_handled)
          : 0,
      costUsd: Math.round(row.cost_incurred_usd * 100) / 100,
    };
  });

  return methods;
}
