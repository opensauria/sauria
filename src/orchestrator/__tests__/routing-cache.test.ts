import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RoutingCache, buildCacheKey } from '../routing-cache.js';
import type { RoutingDecision } from '../types.js';

const DECISION_A: RoutingDecision = {
  actions: [{ type: 'reply', content: 'Hello' }],
};

const DECISION_B: RoutingDecision = {
  actions: [{ type: 'forward', targetNodeId: 'n2', content: 'forwarded' }],
};

describe('buildCacheKey', () => {
  it('combines sourceNodeId and truncated content', () => {
    const key = buildCacheKey('node1', 'hello world');
    expect(key).toBe('node1:hello world');
  });

  it('truncates content to 100 characters', () => {
    const longContent = 'a'.repeat(200);
    const key = buildCacheKey('node1', longContent);
    expect(key).toBe(`node1:${'a'.repeat(100)}`);
  });
});

describe('RoutingCache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns undefined for missing key', () => {
    const cache = new RoutingCache();
    expect(cache.get('missing')).toBeUndefined();
  });

  it('stores and retrieves a decision', () => {
    const cache = new RoutingCache();
    cache.set('key1', DECISION_A);
    expect(cache.get('key1')).toEqual(DECISION_A);
  });

  it('returns undefined for expired entries', () => {
    const cache = new RoutingCache(1000);
    cache.set('key1', DECISION_A);

    vi.advanceTimersByTime(1001);

    expect(cache.get('key1')).toBeUndefined();
  });

  it('returns entry before TTL expires', () => {
    const cache = new RoutingCache(1000);
    cache.set('key1', DECISION_A);

    vi.advanceTimersByTime(999);

    expect(cache.get('key1')).toEqual(DECISION_A);
  });

  it('evicts oldest entry when at capacity', () => {
    const cache = new RoutingCache();

    for (let i = 0; i < 100; i++) {
      cache.set(`key${i}`, DECISION_A);
    }

    expect(cache.size).toBe(100);

    // Adding one more should evict the oldest (key0)
    cache.set('key100', DECISION_B);
    expect(cache.size).toBe(100);
    expect(cache.get('key0')).toBeUndefined();
    expect(cache.get('key100')).toEqual(DECISION_B);
  });

  it('refreshes LRU order on get', () => {
    const cache = new RoutingCache();

    for (let i = 0; i < 100; i++) {
      cache.set(`key${i}`, DECISION_A);
    }

    // Access key0 to move it to the end (most recently used)
    cache.get('key0');

    // Now key1 is the oldest; adding a new entry should evict key1
    cache.set('new-key', DECISION_B);
    expect(cache.get('key0')).toEqual(DECISION_A);
    expect(cache.get('key1')).toBeUndefined();
  });

  it('overwrites existing entry and refreshes order', () => {
    const cache = new RoutingCache();
    cache.set('key1', DECISION_A);
    cache.set('key1', DECISION_B);

    expect(cache.get('key1')).toEqual(DECISION_B);
    expect(cache.size).toBe(1);
  });

  it('clears all entries', () => {
    const cache = new RoutingCache();
    cache.set('key1', DECISION_A);
    cache.set('key2', DECISION_B);

    cache.clear();

    expect(cache.size).toBe(0);
    expect(cache.get('key1')).toBeUndefined();
  });

  it('removes expired entry from internal storage on get', () => {
    const cache = new RoutingCache(1000);
    cache.set('key1', DECISION_A);

    vi.advanceTimersByTime(1001);

    cache.get('key1');
    // After accessing an expired entry, size should reflect removal
    expect(cache.size).toBe(0);
  });
});
