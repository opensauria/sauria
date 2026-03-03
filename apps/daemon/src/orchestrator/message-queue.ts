import type { InboundMessage } from './types.js';
import { getLogger } from '../utils/logger.js';

export type MessageHandler = (message: InboundMessage) => Promise<void>;

interface QueueOptions {
  readonly maxConcurrent: number;
  readonly maxQueueSize: number;
  readonly onError?: (message: InboundMessage, error: unknown) => void;
}

export class MessageQueue {
  private readonly queue: InboundMessage[] = [];
  private processing = 0;
  private stopped = false;

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

  enqueue(message: InboundMessage): void {
    if (this.queue.length >= this.options.maxQueueSize) {
      const logger = getLogger();
      if (message.senderIsOwner) {
        const dropped = this.queue.pop();
        if (dropped) {
          logger.warn('Queue full — evicted tail message for owner priority', {
            droppedSourceNodeId: dropped.sourceNodeId,
            droppedPlatform: dropped.platform,
          });
        }
        this.queue.unshift(message);
      } else {
        logger.warn('Queue full — dropping non-owner message', {
          sourceNodeId: message.sourceNodeId,
          platform: message.platform,
        });
        return;
      }
    } else if (message.senderIsOwner) {
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

  private async drain(): Promise<void> {
    while (!this.stopped && this.queue.length > 0 && this.processing < this.options.maxConcurrent) {
      const message = this.queue.shift();
      if (!message) break;

      this.processing++;
      this.handler(message)
        .catch((error: unknown) => {
          const logger = getLogger();
          logger.error('Message handler failed', {
            sourceNodeId: message.sourceNodeId,
            platform: message.platform,
            error: error instanceof Error ? error.message : String(error),
          });
          this.options.onError?.(message, error);
        })
        .finally(() => {
          this.processing--;
          void this.drain();
        });
    }
  }
}
