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

  it('drops non-owner messages when queue is full', () => {
    const small = new MessageQueue(handler, { maxConcurrent: 1, maxQueueSize: 2 });
    small.enqueue(makeMessage('a'));
    small.enqueue(makeMessage('b'));
    small.enqueue(makeMessage('c'));
    expect(small.pending).toBe(2);
    small.stop();
  });

  it('evicts tail for owner message when queue is full', async () => {
    const order: string[] = [];
    const trackHandler = vi.fn().mockImplementation(async (msg: InboundMessage) => {
      order.push(msg.content);
    });
    const small = new MessageQueue(trackHandler, { maxConcurrent: 1, maxQueueSize: 2 });
    small.enqueue(makeMessage('a'));
    small.enqueue(makeMessage('b'));
    small.enqueue({ ...makeMessage('owner-urgent'), senderIsOwner: true });
    expect(small.pending).toBe(2);
    await small.flush();
    expect(order[0]).toBe('owner-urgent');
    expect(order).not.toContain('b');
    small.stop();
  });

  it('logs error when handler throws', async () => {
    const error = new Error('handler boom');
    const failHandler = vi
      .fn<(message: InboundMessage) => Promise<void>>()
      .mockRejectedValue(error);
    const q = new MessageQueue(failHandler, { maxConcurrent: 1, maxQueueSize: 10 });
    q.enqueue(makeMessage('fail'));
    await q.flush();
    expect(failHandler).toHaveBeenCalledTimes(1);
    q.stop();
  });

  it('calls onError callback when handler throws', async () => {
    const error = new Error('handler boom');
    const failHandler = vi
      .fn<(message: InboundMessage) => Promise<void>>()
      .mockRejectedValue(error);
    const onError = vi.fn();
    const q = new MessageQueue(failHandler, { maxConcurrent: 1, maxQueueSize: 10, onError });
    q.enqueue(makeMessage('fail'));
    await q.flush();
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ content: 'fail' }), error);
    q.stop();
  });

  it('continues processing after handler error', async () => {
    let callCount = 0;
    const sometimesFailHandler = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) throw new Error('first fails');
    });
    const q = new MessageQueue(sometimesFailHandler, { maxConcurrent: 1, maxQueueSize: 10 });
    q.enqueue(makeMessage('first'));
    q.enqueue(makeMessage('second'));
    await q.flush();
    expect(sometimesFailHandler).toHaveBeenCalledTimes(2);
    q.stop();
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
});
