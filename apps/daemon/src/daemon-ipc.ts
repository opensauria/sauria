import { createServer, type Server, type Socket } from 'node:net';
import { existsSync, unlinkSync, writeFileSync } from 'node:fs';
import type BetterSqlite3 from 'better-sqlite3';
import { paths } from './config/paths.js';
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
import { getLogger } from './utils/logger.js';

const MAX_REQUEST_SIZE = 65_536;

interface IpcRequest {
  readonly id: number;
  readonly method: string;
  readonly params?: Record<string, unknown>;
}

interface IpcResponse {
  readonly id: number;
  readonly result?: unknown;
  readonly error?: { readonly code: string; readonly message: string };
}

export interface DaemonIpcServer {
  close(): Promise<void>;
  broadcast(event: string, data: Record<string, unknown>): void;
  registerMethod(name: string, handler: MethodHandler): void;
}

type MethodHandler = (
  db: BetterSqlite3.Database,
  params: Record<string, unknown>,
) => unknown | Promise<unknown>;

function buildMethodMap(): Map<string, MethodHandler> {
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

function isValidRequest(value: unknown): value is IpcRequest {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const obj = value as Record<string, unknown>;
  return typeof obj['id'] === 'number' && typeof obj['method'] === 'string';
}

function handleConnection(
  socket: Socket,
  db: BetterSqlite3.Database,
  methods: Map<string, MethodHandler>,
): void {
  const logger = getLogger();
  let buffer = '';

  socket.on('data', (chunk: Buffer) => {
    buffer += chunk.toString('utf-8');

    if (buffer.length > MAX_REQUEST_SIZE) {
      const response: IpcResponse = {
        id: 0,
        error: { code: 'REQUEST_TOO_LARGE', message: 'Request exceeds 64KB limit' },
      };
      socket.write(JSON.stringify(response) + '\n');
      buffer = '';
      return;
    }

    let newlineIndex: number;
    while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);

      if (line.length === 0) continue;

      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        const response: IpcResponse = {
          id: 0,
          error: { code: 'PARSE_ERROR', message: 'Invalid JSON' },
        };
        socket.write(JSON.stringify(response) + '\n');
        continue;
      }

      if (!isValidRequest(parsed)) {
        const response: IpcResponse = {
          id: 0,
          error: { code: 'INVALID_REQUEST', message: 'Missing id or method' },
        };
        socket.write(JSON.stringify(response) + '\n');
        continue;
      }

      const handler = methods.get(parsed.method);
      if (!handler) {
        const response: IpcResponse = {
          id: parsed.id,
          error: { code: 'UNKNOWN_METHOD', message: `Unknown method: ${parsed.method}` },
        };
        socket.write(JSON.stringify(response) + '\n');
        continue;
      }

      const writeResult = (id: number, result: unknown): void => {
        const response: IpcResponse = { id, result };
        if (!socket.destroyed) socket.write(JSON.stringify(response) + '\n');
      };

      const writeError = (id: number, method: string, err: unknown): void => {
        logger.error('IPC handler error', {
          method,
          error: err instanceof Error ? err.message : String(err),
        });
        const response: IpcResponse = {
          id,
          error: {
            code: 'HANDLER_ERROR',
            message: err instanceof Error ? err.message : 'Internal error',
          },
        };
        if (!socket.destroyed) socket.write(JSON.stringify(response) + '\n');
      };

      try {
        const result = handler(db, parsed.params ?? {});
        if (result instanceof Promise) {
          result.then(
            (value) => writeResult(parsed.id, value),
            (err: unknown) => writeError(parsed.id, parsed.method, err),
          );
        } else {
          writeResult(parsed.id, result);
        }
      } catch (err: unknown) {
        writeError(parsed.id, parsed.method, err);
      }
    }
  });

  socket.on('error', (err) => {
    logger.warn('IPC socket error', { error: err.message });
  });
}

export async function startIpcServer(
  socketPath: string,
  db: BetterSqlite3.Database,
  startedAt?: number,
): Promise<DaemonIpcServer> {
  const logger = getLogger();
  const methods = buildMethodMap();

  methods.set('daemon:health', () => ({
    status: 'ok',
    uptime: startedAt ? Math.floor((Date.now() - startedAt) / 1000) : 0,
  }));
  const isWindows = process.platform === 'win32';
  const subscribers = new Set<Socket>();

  const server: Server = createServer((socket) => {
    subscribers.add(socket);
    socket.on('close', () => subscribers.delete(socket));
    socket.on('error', () => subscribers.delete(socket));
    handleConnection(socket, db, methods);
  });

  server.on('error', (err) => {
    logger.error('IPC server error', { error: err.message });
  });

  if (isWindows) {
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          writeFileSync(paths.ipcPort, String(addr.port), 'utf-8');
          logger.info('IPC server listening', { port: addr.port });
        }
        resolve();
      });
    });
  } else {
    if (existsSync(socketPath)) {
      unlinkSync(socketPath);
    }

    await new Promise<void>((resolve) => {
      server.listen(socketPath, () => {
        logger.info('IPC server listening', { path: socketPath });
        resolve();
      });
    });
  }

  return {
    close(): Promise<void> {
      return new Promise((resolve) => {
        server.close(() => {
          if (isWindows) {
            if (existsSync(paths.ipcPort)) {
              try {
                unlinkSync(paths.ipcPort);
              } catch {
                // Best-effort cleanup
              }
            }
          } else if (existsSync(socketPath)) {
            try {
              unlinkSync(socketPath);
            } catch {
              // Best-effort cleanup
            }
          }
          logger.info('IPC server stopped');
          resolve();
        });
      });
    },
    broadcast(event: string, data: Record<string, unknown>): void {
      const line = JSON.stringify({ event, data }) + '\n';
      for (const socket of subscribers) {
        if (!socket.destroyed) {
          socket.write(line);
        }
      }
    },
    registerMethod(name: string, handler: MethodHandler): void {
      methods.set(name, handler);
    },
  };
}
