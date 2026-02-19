import { connect, type Socket } from 'node:net';
import { join } from 'node:path';
import { homedir } from 'node:os';

const SOCKET_PATH = process.env['OPENWIND_HOME']
  ? join(process.env['OPENWIND_HOME'], 'daemon.sock')
  : join(homedir(), '.openwind', 'daemon.sock');

const CONNECT_TIMEOUT_MS = 2_000;
const REQUEST_TIMEOUT_MS = 5_000;

interface PendingRequest {
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: Error) => void;
  readonly timer: ReturnType<typeof setTimeout>;
}

let socket: Socket | null = null;
let nextId = 1;
const pending = new Map<number, PendingRequest>();
let buffer = '';

function rejectAll(error: Error): void {
  for (const [id, req] of pending) {
    clearTimeout(req.timer);
    req.reject(error);
    pending.delete(id);
  }
}

function cleanup(): void {
  if (socket) {
    socket.removeAllListeners();
    if (!socket.destroyed) socket.destroy();
    socket = null;
  }
  buffer = '';
}

function handleData(chunk: Buffer): void {
  buffer += chunk.toString('utf-8');

  let newlineIndex: number;
  while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, newlineIndex).trim();
    buffer = buffer.slice(newlineIndex + 1);

    if (line.length === 0) continue;

    try {
      const msg = JSON.parse(line) as {
        id: number;
        result?: unknown;
        error?: { code: string; message: string };
      };
      const req = pending.get(msg.id);
      if (!req) continue;

      pending.delete(msg.id);
      clearTimeout(req.timer);

      if (msg.error) {
        req.reject(new Error(`${msg.error.code}: ${msg.error.message}`));
      } else {
        req.resolve(msg.result);
      }
    } catch {
      // Ignore malformed responses
    }
  }
}

async function getSocket(): Promise<Socket> {
  if (socket && !socket.destroyed) return socket;

  return new Promise<Socket>((resolve, reject) => {
    const sock = connect(SOCKET_PATH);

    const connectTimer = setTimeout(() => {
      sock.destroy();
      reject(new Error('Daemon connect timeout'));
    }, CONNECT_TIMEOUT_MS);

    sock.on('connect', () => {
      clearTimeout(connectTimer);
      sock.on('data', handleData);

      sock.on('error', () => {
        rejectAll(new Error('Daemon connection lost'));
        cleanup();
      });

      sock.on('close', () => {
        rejectAll(new Error('Daemon connection closed'));
        cleanup();
      });

      socket = sock;
      resolve(sock);
    });

    sock.on('error', (err) => {
      clearTimeout(connectTimer);
      reject(err);
    });
  });
}

export async function request<T = unknown>(
  method: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  const sock = await getSocket();
  const id = nextId++;

  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Request timeout: ${method}`));
    }, REQUEST_TIMEOUT_MS);

    pending.set(id, {
      resolve: resolve as (value: unknown) => void,
      reject,
      timer,
    });

    const payload = JSON.stringify({ id, method, params }) + '\n';
    sock.write(payload);
  });
}

export function disconnect(): void {
  rejectAll(new Error('Client disconnecting'));
  cleanup();
}
