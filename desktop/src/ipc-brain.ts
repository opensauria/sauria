import { ipcMain } from 'electron';
import { request, disconnect } from './daemon-client';

export function registerBrainHandlers(): void {
  ipcMain.handle(
    'brain:list-entities',
    (_event, opts: { type?: string; search?: string; offset?: number; limit?: number }) =>
      request('brain:list-entities', opts),
  );

  ipcMain.handle('brain:get-entity', (_event, id: string) =>
    request('brain:get-entity', { id }),
  );

  ipcMain.handle(
    'brain:list-relations',
    (_event, opts: { type?: string; offset?: number; limit?: number }) =>
      request('brain:list-relations', opts),
  );

  ipcMain.handle(
    'brain:list-observations',
    (_event, opts: { type?: string; search?: string; offset?: number; limit?: number }) =>
      request('brain:list-observations', opts),
  );

  ipcMain.handle(
    'brain:list-events',
    (_event, opts: { source?: string; offset?: number; limit?: number }) =>
      request('brain:list-events', opts),
  );

  ipcMain.handle(
    'brain:list-conversations',
    (_event, opts: { platform?: string; offset?: number; limit?: number }) =>
      request('brain:list-conversations', opts),
  );

  ipcMain.handle(
    'brain:get-conversation',
    (_event, id: string, opts: { offset?: number; limit?: number }) =>
      request('brain:get-conversation', { id, ...opts }),
  );

  ipcMain.handle(
    'brain:list-facts',
    (_event, opts: { nodeId?: string; workspaceId?: string; offset?: number; limit?: number }) =>
      request('brain:list-facts', opts),
  );

  ipcMain.handle('brain:get-stats', () => request('brain:get-stats'));

  ipcMain.handle('brain:delete', (_event, table: string, id: string) =>
    request('brain:delete', { table, id }),
  );

  ipcMain.handle(
    'brain:update-entity',
    (_event, id: string, fields: { name?: string; summary?: string | null; type?: string }) =>
      request('brain:update-entity', { id, fields }),
  );
}

export function cleanupBrainDb(): void {
  disconnect();
}
