import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { handleConnection } from '../ipc-connection.js';
import type { MethodHandler } from '../ipc-methods.js';

vi.mock('../utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

function createMockSocket(): EventEmitter & {
  write: ReturnType<typeof vi.fn>;
  destroyed: boolean;
} {
  const emitter = new EventEmitter();
  return Object.assign(emitter, {
    write: vi.fn(),
    destroyed: false,
  });
}

describe('handleConnection', () => {
  let socket: ReturnType<typeof createMockSocket>;
  let methods: Map<string, MethodHandler>;
  const mockDb = {} as never;

  beforeEach(() => {
    socket = createMockSocket();
    methods = new Map<string, MethodHandler>();
  });

  it('responds with PARSE_ERROR for invalid JSON', () => {
    handleConnection(socket as never, mockDb, methods);
    socket.emit('data', Buffer.from('not json\n'));

    expect(socket.write).toHaveBeenCalledWith(expect.stringContaining('"PARSE_ERROR"'));
  });

  it('responds with INVALID_REQUEST when id or method is missing', () => {
    handleConnection(socket as never, mockDb, methods);
    socket.emit('data', Buffer.from('{"foo":"bar"}\n'));

    expect(socket.write).toHaveBeenCalledWith(expect.stringContaining('"INVALID_REQUEST"'));
  });

  it('responds with UNKNOWN_METHOD for unregistered method', () => {
    handleConnection(socket as never, mockDb, methods);
    socket.emit('data', Buffer.from('{"id":1,"method":"nope"}\n'));

    expect(socket.write).toHaveBeenCalledWith(expect.stringContaining('"UNKNOWN_METHOD"'));
  });

  it('calls handler and writes result for valid request', () => {
    methods.set('test:echo', (_db, params) => ({ echo: params['msg'] }));
    handleConnection(socket as never, mockDb, methods);
    socket.emit('data', Buffer.from('{"id":1,"method":"test:echo","params":{"msg":"hi"}}\n'));

    const written = socket.write.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(written) as { id: number; result: { echo: string } };
    expect(parsed.id).toBe(1);
    expect(parsed.result.echo).toBe('hi');
  });

  it('handles async handlers', async () => {
    methods.set('test:async', async () => ({ value: 42 }));
    handleConnection(socket as never, mockDb, methods);
    socket.emit('data', Buffer.from('{"id":2,"method":"test:async"}\n'));

    await vi.waitFor(() => {
      expect(socket.write).toHaveBeenCalled();
    });

    const written = socket.write.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(written) as { id: number; result: { value: number } };
    expect(parsed.id).toBe(2);
    expect(parsed.result.value).toBe(42);
  });

  it('handles sync handler errors', () => {
    methods.set('test:fail', () => {
      throw new Error('boom');
    });
    handleConnection(socket as never, mockDb, methods);
    socket.emit('data', Buffer.from('{"id":3,"method":"test:fail"}\n'));

    const written = socket.write.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(written) as { id: number; error: { code: string; message: string } };
    expect(parsed.error.code).toBe('HANDLER_ERROR');
    expect(parsed.error.message).toBe('boom');
  });

  it('handles async handler errors', async () => {
    methods.set('test:async-fail', async () => {
      throw new Error('async boom');
    });
    handleConnection(socket as never, mockDb, methods);
    socket.emit('data', Buffer.from('{"id":4,"method":"test:async-fail"}\n'));

    await vi.waitFor(() => {
      expect(socket.write).toHaveBeenCalled();
    });

    const written = socket.write.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(written) as { id: number; error: { code: string; message: string } };
    expect(parsed.error.code).toBe('HANDLER_ERROR');
    expect(parsed.error.message).toBe('async boom');
  });

  it('responds with REQUEST_TOO_LARGE when buffer exceeds limit', () => {
    handleConnection(socket as never, mockDb, methods);
    const largePayload = 'x'.repeat(70_000);
    socket.emit('data', Buffer.from(largePayload));

    expect(socket.write).toHaveBeenCalledWith(expect.stringContaining('"REQUEST_TOO_LARGE"'));
  });

  it('processes multiple newline-delimited messages in one chunk', () => {
    methods.set('test:echo', (_db, params) => ({ v: params['v'] }));
    handleConnection(socket as never, mockDb, methods);

    const combined =
      '{"id":1,"method":"test:echo","params":{"v":"a"}}\n' +
      '{"id":2,"method":"test:echo","params":{"v":"b"}}\n';
    socket.emit('data', Buffer.from(combined));

    expect(socket.write).toHaveBeenCalledTimes(2);
  });

  it('skips empty lines', () => {
    handleConnection(socket as never, mockDb, methods);
    socket.emit('data', Buffer.from('\n\n\n'));

    expect(socket.write).not.toHaveBeenCalled();
  });

  it('does not write if socket is destroyed', () => {
    methods.set('test:ok', () => 'ok');
    handleConnection(socket as never, mockDb, methods);
    socket.destroyed = true;
    socket.emit('data', Buffer.from('{"id":1,"method":"test:ok"}\n'));

    expect(socket.write).not.toHaveBeenCalled();
  });

  it('handles socket error event without crashing', () => {
    handleConnection(socket as never, mockDb, methods);
    expect(() => socket.emit('error', new Error('socket err'))).not.toThrow();
  });
});
