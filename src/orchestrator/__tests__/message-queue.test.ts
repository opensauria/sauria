import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MessageQueue } from '../message-queue.js';
import type { InboundMessage } from '../types.js';

function makeMessage(content: string): InboundMessage {
  return {
    sourceNodeId: 'node-1',
    platform: 'telegram',
    senderId: 'user-1',
    senderIsCeo: false,
    groupId: null,
    content,
    contentType: 'text',
    timestamp: new Date().toISOString(),
  };
}

describe('MessageQueue', () => {
  let queue: MessageQueue;
  let handler: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    handler = vi.fn().mockResolvedValue(undefined);
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

  it('prioritizes CEO messages', async () => {
    const order: string[] = [];
    const slowHandler = vi.fn().mockImplementation(async (msg: InboundMessage) => {
      order.push(msg.content);
    });
    const q = new MessageQueue(slowHandler, { maxConcurrent: 1, maxQueueSize: 10 });
    q.enqueue(makeMessage('normal'));
    q.enqueue({ ...makeMessage('ceo'), senderIsCeo: true });
    await q.flush();
    expect(order[0]).toBe('ceo');
    q.stop();
  });
});
