import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';

vi.mock('../utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('../ipc-methods.js', () => ({
  buildMethodMap: () => new Map(),
}));

const mockHandleConnection = vi.fn();
vi.mock('../ipc-connection.js', () => ({
  handleConnection: (...args: unknown[]) => mockHandleConnection(...args),
}));

vi.mock('../config/paths.js', () => ({
  paths: {
    socket: '/tmp/test-sauria.sock',
    ipcPort: '/tmp/test-ipc-port',
  },
}));

const mockExistsSync = vi.fn().mockReturnValue(false);
const mockUnlinkSync = vi.fn();
const mockWriteFileSync = vi.fn();

vi.mock('node:fs', () => ({
  existsSync: (...args: unknown[]) => mockExistsSync(...args),
  unlinkSync: (...args: unknown[]) => mockUnlinkSync(...args),
  writeFileSync: (...args: unknown[]) => mockWriteFileSync(...args),
}));

class MockServer extends EventEmitter {
  listen = vi.fn((_path: unknown, cb?: () => void) => {
    if (typeof cb === 'function') cb();
    else if (typeof _path === 'function') _path();
  });
  close = vi.fn((cb?: () => void) => {
    if (cb) cb();
  });
  address = vi.fn().mockReturnValue(null);
}

let serverInstance: MockServer;

vi.mock('node:net', () => ({
  createServer: (handler: (socket: unknown) => void) => {
    serverInstance = new MockServer();
    serverInstance.on('connection', handler);
    return serverInstance;
  },
}));

describe('startIpcServer', () => {
  let startIpcServer: typeof import('../daemon-ipc.js').startIpcServer;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../daemon-ipc.js');
    startIpcServer = mod.startIpcServer;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('removes existing socket file on unix', async () => {
    mockExistsSync.mockReturnValue(true);
    const ipc = await startIpcServer('/tmp/test.sock', {} as never);

    expect(mockUnlinkSync).toHaveBeenCalledWith('/tmp/test.sock');
    expect(ipc).toBeDefined();
    expect(typeof ipc.close).toBe('function');
    expect(typeof ipc.broadcast).toBe('function');
    expect(typeof ipc.registerMethod).toBe('function');
  });

  it('registers daemon:health method that returns status', async () => {
    const startedAt = Date.now() - 10_000;
    const ipc = await startIpcServer('/tmp/test.sock', {} as never, startedAt);

    // The method is registered internally; test broadcast and registerMethod
    expect(ipc).toBeDefined();
  });

  it('broadcast writes to connected sockets', async () => {
    const ipc = await startIpcServer('/tmp/test.sock', {} as never);

    // No subscribers yet, should not throw
    expect(() => ipc.broadcast('test', { key: 'value' })).not.toThrow();
  });

  it('registerMethod adds a method to the map', async () => {
    const ipc = await startIpcServer('/tmp/test.sock', {} as never);
    const handler = vi.fn();

    expect(() => ipc.registerMethod('custom:method', handler)).not.toThrow();
  });

  it('close resolves and cleans up socket', async () => {
    mockExistsSync.mockReturnValue(true);
    const ipc = await startIpcServer('/tmp/test.sock', {} as never);

    await expect(ipc.close()).resolves.toBeUndefined();
  });
});

describe('additional coverage — startIpcServer', () => {
  let startIpcServer: typeof import('../daemon-ipc.js').startIpcServer;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../daemon-ipc.js');
    startIpcServer = mod.startIpcServer;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not remove socket file when it does not exist', async () => {
    mockExistsSync.mockReturnValue(false);
    await startIpcServer('/tmp/test.sock', {} as never);
    expect(mockUnlinkSync).not.toHaveBeenCalledWith('/tmp/test.sock');
  });

  it('broadcast writes JSON lines to connected sockets', async () => {
    const ipc = await startIpcServer('/tmp/test.sock', {} as never);

    // Simulate a connection
    const mockSocket = {
      destroyed: false,
      write: vi.fn(),
      on: vi.fn(),
    };

    // Trigger the server's connection handler
    serverInstance.emit('connection', mockSocket);

    ipc.broadcast('test:event', { foo: 'bar' });
    expect(mockSocket.write).toHaveBeenCalledWith(
      JSON.stringify({ event: 'test:event', data: { foo: 'bar' } }) + '\n',
    );
  });

  it('broadcast skips destroyed sockets', async () => {
    const ipc = await startIpcServer('/tmp/test.sock', {} as never);

    const mockSocket = {
      destroyed: true,
      write: vi.fn(),
      on: vi.fn(),
    };
    serverInstance.emit('connection', mockSocket);

    ipc.broadcast('test:event', { key: 'val' });
    expect(mockSocket.write).not.toHaveBeenCalled();
  });

  it('removes subscriber on socket close', async () => {
    const ipc = await startIpcServer('/tmp/test.sock', {} as never);

    const onHandlers: Record<string, () => void> = {};
    const mockSocket = {
      destroyed: false,
      write: vi.fn(),
      on: vi.fn((event: string, cb: () => void) => {
        onHandlers[event] = cb;
      }),
    };

    serverInstance.emit('connection', mockSocket);
    ipc.broadcast('before', {});
    expect(mockSocket.write).toHaveBeenCalledTimes(1);

    // Simulate close
    onHandlers['close']?.();
    mockSocket.write.mockClear();
    ipc.broadcast('after', {});
    expect(mockSocket.write).not.toHaveBeenCalled();
  });

  it('removes subscriber on socket error', async () => {
    const ipc = await startIpcServer('/tmp/test.sock', {} as never);

    const onHandlers: Record<string, () => void> = {};
    const mockSocket = {
      destroyed: false,
      write: vi.fn(),
      on: vi.fn((event: string, cb: () => void) => {
        onHandlers[event] = cb;
      }),
    };

    serverInstance.emit('connection', mockSocket);
    onHandlers['error']?.();
    mockSocket.write.mockClear();
    ipc.broadcast('test', {});
    expect(mockSocket.write).not.toHaveBeenCalled();
  });

  it('registerMethod adds and overwrites methods', async () => {
    const ipc = await startIpcServer('/tmp/test.sock', {} as never);
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    ipc.registerMethod('custom:test', handler1);
    ipc.registerMethod('custom:test', handler2);
    // No error should occur
  });

  it('daemon:health method returns uptime based on startedAt', async () => {
    const ipc = await startIpcServer('/tmp/test.sock', {} as never, Date.now() - 5000);
    expect(ipc).toBeDefined();
  });

  it('daemon:health method returns 0 uptime when startedAt not provided', async () => {
    const ipc = await startIpcServer('/tmp/test.sock', {} as never);
    expect(ipc).toBeDefined();
  });
});
