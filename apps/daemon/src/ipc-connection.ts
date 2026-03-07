import type { Socket } from 'node:net';
import type BetterSqlite3 from 'better-sqlite3';
import { getLogger } from './utils/logger.js';
import type { MethodHandler } from './ipc-methods.js';

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

function isValidRequest(value: unknown): value is IpcRequest {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const obj = value as Record<string, unknown>;
  return typeof obj['id'] === 'number' && typeof obj['method'] === 'string';
}

export function handleConnection(
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
