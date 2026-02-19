import type { RoutingDecision } from './types.js';

const MAX_ENTRIES = 100;
const DEFAULT_TTL_MS = 300_000; // 5 minutes

interface CacheEntry {
  readonly decision: RoutingDecision;
  readonly expiresAt: number;
}

export function buildCacheKey(
  sourceNodeId: string,
  content: string,
  conversationId: string | null = null,
): string {
  const truncated = content.slice(0, 100);
  return `${sourceNodeId}:${conversationId ?? ''}:${truncated}`;
}

export class RoutingCache {
  private readonly entries = new Map<string, CacheEntry>();
  private readonly ttlMs: number;

  constructor(ttlMs = DEFAULT_TTL_MS) {
    this.ttlMs = ttlMs;
  }

  get(key: string): RoutingDecision | undefined {
    const entry = this.entries.get(key);
    if (!entry) {
      return undefined;
    }

    if (Date.now() > entry.expiresAt) {
      this.entries.delete(key);
      return undefined;
    }

    // Move to end for LRU ordering (Map preserves insertion order)
    this.entries.delete(key);
    this.entries.set(key, entry);

    return entry.decision;
  }

  set(key: string, decision: RoutingDecision): void {
    // If key exists, delete first to refresh insertion order
    if (this.entries.has(key)) {
      this.entries.delete(key);
    }

    // Evict oldest entry if at capacity
    if (this.entries.size >= MAX_ENTRIES) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey !== undefined) {
        this.entries.delete(oldestKey);
      }
    }

    this.entries.set(key, {
      decision,
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  get size(): number {
    return this.entries.size;
  }

  clear(): void {
    this.entries.clear();
  }
}
