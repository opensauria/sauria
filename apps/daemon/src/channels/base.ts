import type { ProactiveAlert } from '../engine/proactive.js';
import { createLimiter, SECURITY_LIMITS, type RateLimiter } from '../security/rate-limiter.js';

export interface Channel {
  readonly name: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  sendAlert(alert: ProactiveAlert): Promise<void>;
  sendMessage(content: string, groupId: string | null): Promise<void>;
  sendToGroup(groupId: string, content: string): Promise<void>;
}

// ─── Shared channel utilities ────────────────────────────────────────

const SILENCE_MS_PER_HOUR = 3_600_000;

export class ChannelGuards {
  readonly limiter: RateLimiter;
  private silenceUntil = 0;

  constructor(platform: string) {
    this.limiter = createLimiter(
      platform,
      SECURITY_LIMITS.channels.maxInboundMessagesPerMinute,
      60_000,
    );
  }

  silence(hours: number): void {
    this.silenceUntil = Date.now() + hours * SILENCE_MS_PER_HOUR;
  }

  isSilenced(): boolean {
    return Date.now() < this.silenceUntil;
  }

  tryConsume(): boolean {
    return this.limiter.tryConsume();
  }
}

export class PollController {
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  constructor(private readonly intervalMs: number) {}

  start(pollFn: () => Promise<void>): void {
    this.stopped = false;
    this.schedule(pollFn);
  }

  stop(): void {
    this.stopped = true;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  get isStopped(): boolean {
    return this.stopped;
  }

  private schedule(pollFn: () => Promise<void>): void {
    if (this.stopped) return;
    this.pollTimer = setTimeout(async () => {
      await pollFn();
      this.schedule(pollFn);
    }, this.intervalMs);
  }
}

// ─── Alert formatting ────────────────────────────────────────────────

const MAX_BODY_LENGTH = 500;

function getPriorityPrefix(priority: number): string {
  if (priority >= 4) return '[!!!]';
  if (priority === 3) return '[!!]';
  if (priority === 2) return '[!]';
  return '[i]';
}

export function formatAlert(alert: ProactiveAlert): string {
  const prefix = getPriorityPrefix(alert.priority);
  const truncatedDetails =
    alert.details.length > MAX_BODY_LENGTH
      ? `${alert.details.slice(0, MAX_BODY_LENGTH)}...`
      : alert.details;

  return `${prefix} ${alert.title}\n\n${truncatedDetails}`;
}

export function alertPriorityValue(priority: number): number {
  return Math.max(0, Math.min(5, priority));
}
