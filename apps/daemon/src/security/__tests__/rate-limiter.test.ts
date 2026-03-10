import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
  SECURITY_LIMITS,
  RateLimiter,
  createLimiter,
  createPerSenderLimiter,
} from '../rate-limiter.js';

describe('RateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts with max tokens available', () => {
    const limiter = new RateLimiter(5, 1, 1000);
    // Should succeed 5 times
    for (let i = 0; i < 5; i++) {
      expect(limiter.tryConsume()).toBe(true);
    }
  });

  it('tryConsume decrements tokens', () => {
    const limiter = new RateLimiter(3, 1, 1000);
    expect(limiter.tryConsume()).toBe(true);
    expect(limiter.tryConsume()).toBe(true);
    expect(limiter.tryConsume()).toBe(true);
    expect(limiter.tryConsume()).toBe(false);
  });

  it('returns false when empty', () => {
    const limiter = new RateLimiter(1, 1, 1000);
    limiter.tryConsume();
    expect(limiter.tryConsume()).toBe(false);
  });

  it('refills after interval', () => {
    const limiter = new RateLimiter(2, 1, 1000);
    limiter.tryConsume();
    limiter.tryConsume();
    expect(limiter.tryConsume()).toBe(false);

    vi.advanceTimersByTime(1000);
    expect(limiter.tryConsume()).toBe(true);
  });

  it('applies partial refill using floor', () => {
    const limiter = new RateLimiter(10, 2, 1000);
    // Consume all
    for (let i = 0; i < 10; i++) {
      limiter.tryConsume();
    }

    // Advance 2.5 intervals -> floor(2.5) = 2 intervals -> 2 * 2 = 4 tokens
    vi.advanceTimersByTime(2500);
    for (let i = 0; i < 4; i++) {
      expect(limiter.tryConsume()).toBe(true);
    }
    expect(limiter.tryConsume()).toBe(false);
  });

  it('does not exceed max tokens on refill', () => {
    const limiter = new RateLimiter(3, 3, 1000);
    // Don't consume anything, advance time a lot
    vi.advanceTimersByTime(10_000);
    // Should still only have 3 tokens
    expect(limiter.tryConsume()).toBe(true);
    expect(limiter.tryConsume()).toBe(true);
    expect(limiter.tryConsume()).toBe(true);
    expect(limiter.tryConsume()).toBe(false);
  });

  it('reset restores to max tokens', () => {
    const limiter = new RateLimiter(5, 1, 1000);
    for (let i = 0; i < 5; i++) {
      limiter.tryConsume();
    }
    expect(limiter.tryConsume()).toBe(false);

    limiter.reset();
    expect(limiter.tryConsume()).toBe(true);
  });

  it('consumes multiple tokens at once', () => {
    const limiter = new RateLimiter(10, 1, 1000);
    expect(limiter.tryConsume(5)).toBe(true);
    expect(limiter.tryConsume(5)).toBe(true);
    expect(limiter.tryConsume(1)).toBe(false);
  });

  it('returns false when requesting more tokens than available', () => {
    const limiter = new RateLimiter(3, 1, 1000);
    expect(limiter.tryConsume(4)).toBe(false);
  });

  it('does not refill when zero time has elapsed', () => {
    const limiter = new RateLimiter(2, 1, 1000);
    limiter.tryConsume();
    limiter.tryConsume();
    // No time advance
    expect(limiter.tryConsume()).toBe(false);
  });
});

describe('createLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns a working limiter', () => {
    const limiter = createLimiter('test', 3, 1000);
    expect(limiter.tryConsume()).toBe(true);
    expect(limiter.tryConsume()).toBe(true);
    expect(limiter.tryConsume()).toBe(true);
    expect(limiter.tryConsume()).toBe(false);
  });

  it('refills after the specified period', () => {
    const limiter = createLimiter('test', 2, 5000);
    limiter.tryConsume();
    limiter.tryConsume();
    expect(limiter.tryConsume()).toBe(false);

    vi.advanceTimersByTime(5000);
    expect(limiter.tryConsume()).toBe(true);
  });
});

describe('createPerSenderLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('isolates per sender', () => {
    const check = createPerSenderLimiter(2, 1000);
    expect(check('alice')).toBe(true);
    expect(check('alice')).toBe(true);
    expect(check('alice')).toBe(false);
    // Bob still has tokens
    expect(check('bob')).toBe(true);
  });

  it('evicts stale entries after 2x TTL', () => {
    const check = createPerSenderLimiter(1, 1000);
    check('stale-user');
    // Advance past 2x period (2000ms)
    vi.advanceTimersByTime(2001);
    // Trigger eviction by calling for another sender
    check('new-user');
    // stale-user should be evicted, gets fresh limiter
    expect(check('stale-user')).toBe(true);
  });

  it('gives new sender a fresh limiter', () => {
    const check = createPerSenderLimiter(3, 1000);
    expect(check('new-sender')).toBe(true);
  });

  it('shares state for the same sender', () => {
    const check = createPerSenderLimiter(2, 1000);
    expect(check('shared')).toBe(true);
    expect(check('shared')).toBe(true);
    expect(check('shared')).toBe(false);
  });
});

describe('SECURITY_LIMITS', () => {
  it('has ai field', () => {
    expect(SECURITY_LIMITS.ai).toBeDefined();
  });

  it('has ingestion field', () => {
    expect(SECURITY_LIMITS.ingestion).toBeDefined();
  });

  it('has channels field', () => {
    expect(SECURITY_LIMITS.channels).toBeDefined();
  });

  it('has mcp field', () => {
    expect(SECURITY_LIMITS.mcp).toBeDefined();
  });

  it('has database field', () => {
    expect(SECURITY_LIMITS.database).toBeDefined();
  });
});
