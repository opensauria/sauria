import { createServer, type Server, type Socket } from 'node:net';
import { existsSync, unlinkSync, writeFileSync } from 'node:fs';
import type BetterSqlite3 from 'better-sqlite3';
import { paths } from './config/paths.js';
import { getLogger } from './utils/logger.js';
import { buildMethodMap } from './ipc-methods.js';
import type { MethodHandler } from './ipc-methods.js';
import { handleConnection } from './ipc-connection.js';

export interface DaemonIpcServer {
  close(): Promise<void>;
  broadcast(event: string, data: Record<string, unknown>): void;
  registerMethod(name: string, handler: MethodHandler): void;
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
