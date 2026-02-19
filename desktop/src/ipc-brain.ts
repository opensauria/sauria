import { ipcMain } from 'electron';
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
  closeDb,
} from './db-reader.js';

export function registerBrainHandlers(): void {
  ipcMain.handle(
    'brain:list-entities',
    (_event, opts: { type?: string; search?: string; offset?: number; limit?: number }) =>
      listEntities(opts),
  );

  ipcMain.handle('brain:get-entity', (_event, id: string) => getEntityDetail(id));

  ipcMain.handle(
    'brain:list-relations',
    (_event, opts: { type?: string; offset?: number; limit?: number }) => listRelations(opts),
  );

  ipcMain.handle(
    'brain:list-observations',
    (_event, opts: { type?: string; search?: string; offset?: number; limit?: number }) =>
      listObservations(opts),
  );

  ipcMain.handle(
    'brain:list-events',
    (_event, opts: { source?: string; offset?: number; limit?: number }) => listEvents(opts),
  );

  ipcMain.handle(
    'brain:list-conversations',
    (_event, opts: { platform?: string; offset?: number; limit?: number }) =>
      listConversations(opts),
  );

  ipcMain.handle(
    'brain:get-conversation',
    (_event, id: string, opts: { offset?: number; limit?: number }) =>
      getConversationMessages(id, opts),
  );

  ipcMain.handle(
    'brain:list-facts',
    (_event, opts: { nodeId?: string; workspaceId?: string; offset?: number; limit?: number }) =>
      listFacts(opts),
  );

  ipcMain.handle('brain:get-stats', () => getStats());

  ipcMain.handle('brain:delete', (_event, table: string, id: string) => {
    if (table === 'agent_conversations') {
      return deleteConversation(id);
    }
    return deleteRow(table, id);
  });

  ipcMain.handle(
    'brain:update-entity',
    (_event, id: string, fields: { name?: string; summary?: string | null; type?: string }) =>
      updateEntity(id, fields),
  );
}

export function cleanupBrainDb(): void {
  closeDb();
}
