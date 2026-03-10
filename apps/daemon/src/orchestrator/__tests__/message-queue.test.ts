import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MessageQueue } from '../message-queue.js';
import type { InboundMessage } from '../types.js';

function makeMessage(content: string): InboundMessage {
  return {
    sourceNodeId: 'node-1',
    platform: 'telegram',
    senderId: 'user-1',
    senderIsOwner: false,
    groupId: null,
    content,
    contentType: 'text',
    timestamp: new Date().toISOString(),
  };
}

describe('MessageQueue', () => {
  let queue: MessageQueue;
  let handler: (message: InboundMessage) => Promise<void>;

  beforeEach(() => {
    handler = vi.fn<(message: InboundMessage) => Promise<void>>().mockResolvedValue(undefined);
    queue = new MessageQueue(handler, { maxConcurrent: 2, maxQueueSize: 10 });
  });

  afterEach(() => {
    queue.stop();
  });

  it('processes enqueued messages', async () => {
    queue.enqueue(makeMessage('hello'));
    await queue.flush();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('reports pending count', () => {
    queue.enqueue(makeMessage('a'));
    queue.enqueue(makeMessage('b'));
    expect(queue.pending).toBe(2);
  });

  it('rejects when queue is full', () => {
    const small = new MessageQueue(handler, { maxConcurrent: 1, maxQueueSize: 2 });
    small.enqueue(makeMessage('a'));
    small.enqueue(makeMessage('b'));
    expect(() => small.enqueue(makeMessage('c'))).toThrow('Queue full');
    small.stop();
  });

  it('prioritizes owner messages', async () => {
    const order: string[] = [];
    const slowHandler = vi.fn().mockImplementation(async (msg: InboundMessage) => {
      order.push(msg.content);
    });
    const q = new MessageQueue(slowHandler, { maxConcurrent: 1, maxQueueSize: 10 });
    q.enqueue(makeMessage('normal'));
    q.enqueue({ ...makeMessage('owner-msg'), senderIsOwner: true });
    await q.flush();
    expect(order[0]).toBe('owner-msg');
    q.stop();
  });

  it('reports active count during processing', async () => {
    let resolveHandler: (() => void) | null = null;
    const blockingHandler = vi.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveHandler = resolve;
        }),
    );
    const q = new MessageQueue(blockingHandler, { maxConcurrent: 2, maxQueueSize: 10 });
    q.enqueue(makeMessage('blocking'));

    // Wait for microtask to drain
    await new Promise((r) => setTimeout(r, 10));

    expect(q.active).toBe(1);
    resolveHandler!();
    await q.flush();
    expect(q.active).toBe(0);
    q.stop();
  });

  it('tracks failure count when handler throws', async () => {
    const failHandler = vi.fn().mockRejectedValue(new Error('handler error'));
    const q = new MessageQueue(failHandler, { maxConcurrent: 1, maxQueueSize: 10 });
    q.enqueue(makeMessage('will-fail'));
    await q.flush();
    expect(q.failures).toBe(1);
    q.stop();
  });

  it('stop clears the queue immediately', () => {
    queue.enqueue(makeMessage('a'));
    queue.enqueue(makeMessage('b'));
    expect(queue.pending).toBe(2);
    queue.stop();
    expect(queue.pending).toBe(0);
  });

  it('does not process messages after stop', async () => {
    queue.stop();
    expect(() => queue.enqueue(makeMessage('after-stop'))).not.toThrow();
    // Message enqueued but drain should not process due to stopped flag
    await new Promise((r) => setTimeout(r, 20));
    expect(handler).not.toHaveBeenCalled();
  });

  it('gracefulStop waits for in-flight messages', async () => {
    let resolveHandler: (() => void) | null = null;
    const blockingHandler = vi.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveHandler = resolve;
        }),
    );
    const q = new MessageQueue(blockingHandler, { maxConcurrent: 1, maxQueueSize: 10 });
    q.enqueue(makeMessage('in-flight'));

    // Wait for it to start processing
    await new Promise((r) => setTimeout(r, 10));

    const stopPromise = q.gracefulStop(500);
    resolveHandler!();
    await stopPromise;

    expect(q.pending).toBe(0);
  });

  it('gracefulStop times out and clears queue', async () => {
    const neverResolve = vi.fn().mockImplementation(() => new Promise<void>(() => {}));
    const q = new MessageQueue(neverResolve, { maxConcurrent: 1, maxQueueSize: 10 });
    q.enqueue(makeMessage('stuck'));

    await new Promise((r) => setTimeout(r, 10));

    await q.gracefulStop(100);
    expect(q.pending).toBe(0);
  });

  it('flush resolves when queue is already empty', async () => {
    await expect(queue.flush()).resolves.toBeUndefined();
  });

  it('respects maxConcurrent limit', async () => {
    let concurrent = 0;
    let maxConcurrent = 0;
    const trackingHandler = vi.fn().mockImplementation(async () => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((r) => setTimeout(r, 20));
      concurrent--;
    });
    const q = new MessageQueue(trackingHandler, { maxConcurrent: 2, maxQueueSize: 10 });
    q.enqueue(makeMessage('a'));
    q.enqueue(makeMessage('b'));
    q.enqueue(makeMessage('c'));
    q.enqueue(makeMessage('d'));
    await q.flush();
    expect(maxConcurrent).toBeLessThanOrEqual(2);
    expect(trackingHandler).toHaveBeenCalledTimes(4);
    q.stop();
  });
});
