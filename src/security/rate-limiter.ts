export const SECURITY_LIMITS = {
  ai: {
    extractionCallsPerHour: 100,
    reasoningCallsPerHour: 30,
    deepReasoningCallsPerDay: 10,
    maxConcurrentCalls: 3,
    dailyBudgetUsd: 5.0,
    warnBudgetUsd: 3.0,
    maxTokensPerRequest: 16384,
    requestTimeoutMs: 30_000,
  },
  ingestion: {
    maxEventsPerHour: 500,
    maxEntityUpdatesPerHour: 200,
    maxEmailsPerSync: 100,
    maxEntitiesPerExtraction: 50,
    maxRelationsPerExtraction: 100,
  },
  channels: {
    maxInboundMessagesPerMinute: 10,
    maxProactiveAlertsPerDay: 5,
    cooldownBetweenSimilarAlerts: 7200,
    unknownSenderBehavior: 'silent_ignore' as const,
  },
  mcp: {
    maxQueriesPerMinute: 30,
    maxResponseSizeBytes: 100_000,
    maxConcurrentClients: 5,
  },
  database: {
    maxSizeWarnBytes: 1_073_741_824,
    maxSizeHardLimitBytes: 5_368_709_120,
  },
} as const;

export class RateLimiter {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private readonly maxTokens: number,
    private readonly refillRate: number,
    private readonly refillIntervalMs: number,
  ) {
    this.tokens = maxTokens;
    this.lastRefill = Date.now();
  }

  tryConsume(tokens = 1): boolean {
    this.refill();

    if (this.tokens < tokens) {
      return false;
    }

    this.tokens -= tokens;
    return true;
  }

  reset(): void {
    this.tokens = this.maxTokens;
    this.lastRefill = Date.now();
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const intervalsElapsed = Math.floor(elapsed / this.refillIntervalMs);

    if (intervalsElapsed <= 0) {
      return;
    }

    this.tokens = Math.min(this.maxTokens, this.tokens + intervalsElapsed * this.refillRate);
    this.lastRefill += intervalsElapsed * this.refillIntervalMs;
  }
}

export function createLimiter(_name: string, maxPerPeriod: number, periodMs: number): RateLimiter {
  return new RateLimiter(maxPerPeriod, maxPerPeriod, periodMs);
}

export function createPerSenderLimiter(
  maxPerPeriod: number,
  periodMs: number,
): (senderId: string) => boolean {
  const limiters = new Map<string, RateLimiter>();
  const TTL_MS = periodMs * 2;
  const timestamps = new Map<string, number>();

  return (senderId: string): boolean => {
    const now = Date.now();

    // Evict stale entries
    for (const [id, ts] of timestamps) {
      if (now - ts > TTL_MS) {
        limiters.delete(id);
        timestamps.delete(id);
      }
    }

    let limiter = limiters.get(senderId);
    if (!limiter) {
      limiter = new RateLimiter(maxPerPeriod, maxPerPeriod, periodMs);
      limiters.set(senderId, limiter);
    }
    timestamps.set(senderId, now);

    return limiter.tryConsume();
  };
}
