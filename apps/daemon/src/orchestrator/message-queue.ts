import type { InboundMessage } from './types.js';
import { getLogger } from '../utils/logger.js';

export type MessageHandler = (message: InboundMessage) => Promise<void>;

interface QueueOptions {
  readonly maxConcurrent: number;
  readonly maxQueueSize: number;
}

export class MessageQueue {
  private readonly queue: InboundMessage[] = [];
  private processing = 0;
  private stopped = false;
  private failureCount = 0;

  constructor(
    private readonly handler: MessageHandler,
    private readonly options: QueueOptions,
  ) {}

  get pending(): number {
    return this.queue.length;
  }

  get active(): number {
    return this.processing;
  }

  get failures(): number {
    return this.failureCount;
  }

  enqueue(message: InboundMessage): void {
    if (this.queue.length >= this.options.maxQueueSize) {
      throw new Error('Queue full — backpressure active');
    }

    if (message.senderIsOwner) {
      this.queue.unshift(message);
    } else {
      this.queue.push(message);
    }

    queueMicrotask(() => void this.drain());
  }

  async flush(): Promise<void> {
    while (this.queue.length > 0 || this.processing > 0) {
      await this.drain();
      if (this.processing > 0) {
        await new Promise((r) => setTimeout(r, 10));
      }
    }
  }

  stop(): void {
    this.stopped = true;
    this.queue.length = 0;
  }

  async gracefulStop(timeoutMs = 5000): Promise<void> {
    this.stopped = true;
    const deadline = Date.now() + timeoutMs;
    while ((this.queue.length > 0 || this.processing > 0) && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 50));
    }
    this.queue.length = 0;
  }

  private async drain(): Promise<void> {
    while (!this.stopped && this.queue.length > 0 && this.processing < this.options.maxConcurrent) {
      const message = this.queue.shift();
      if (!message) break;

      this.processing++;
      this.handler(message)
        .catch((err: unknown) => {
          this.failureCount++;
          const logger = getLogger();
          logger.error('Message handler failed', {
            sourceNodeId: message.sourceNodeId,
            error: err instanceof Error ? err.message : String(err),
          });
        })
        .finally(() => {
          this.processing--;
          void this.drain();
        });
    }
  }
}
