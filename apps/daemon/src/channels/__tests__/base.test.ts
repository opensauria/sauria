import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ChannelGuards, PollController, formatAlert, alertPriorityValue } from '../base.js';
import type { ProactiveAlert } from '../../engine/proactive.js';

function makeAlert(overrides: Partial<ProactiveAlert> = {}): ProactiveAlert {
  return {
    type: 'deadline',
    priority: 2,
    title: 'Test Alert',
    details: 'Some details here',
    entityIds: ['e1'],
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

describe('ChannelGuards', () => {
  let guards: ChannelGuards;

  beforeEach(() => {
    vi.useFakeTimers();
    guards = new ChannelGuards('test');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts not silenced', () => {
    expect(guards.isSilenced()).toBe(false);
  });

  it('silence sets silenced state for given hours', () => {
    guards.silence(2);
    expect(guards.isSilenced()).toBe(true);
  });

  it('silence expires after the given duration', () => {
    guards.silence(1);
    expect(guards.isSilenced()).toBe(true);
    vi.advanceTimersByTime(3_600_001);
    expect(guards.isSilenced()).toBe(false);
  });

  it('tryConsume returns true when under rate limit', () => {
    expect(guards.tryConsume()).toBe(true);
  });

  it('tryConsume returns false when rate limit exhausted', () => {
    // Default is 10 per minute
    for (let i = 0; i < 10; i++) {
      guards.tryConsume();
    }
    expect(guards.tryConsume()).toBe(false);
  });

  it('tryConsume recovers after refill interval', () => {
    for (let i = 0; i < 10; i++) {
      guards.tryConsume();
    }
    expect(guards.tryConsume()).toBe(false);
    vi.advanceTimersByTime(60_000);
    expect(guards.tryConsume()).toBe(true);
  });
});

describe('PollController', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts not stopped', () => {
    const controller = new PollController(1000);
    controller.start(vi.fn().mockResolvedValue(undefined));
    expect(controller.isStopped).toBe(false);
    controller.stop();
  });

  it('calls pollFn on interval', async () => {
    const pollFn = vi.fn().mockResolvedValue(undefined);
    const controller = new PollController(1000);
    controller.start(pollFn);

    await vi.advanceTimersByTimeAsync(1000);
    expect(pollFn).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(pollFn).toHaveBeenCalledTimes(2);

    controller.stop();
  });

  it('stop prevents further polling', async () => {
    const pollFn = vi.fn().mockResolvedValue(undefined);
    const controller = new PollController(1000);
    controller.start(pollFn);

    await vi.advanceTimersByTimeAsync(1000);
    controller.stop();
    expect(controller.isStopped).toBe(true);

    await vi.advanceTimersByTimeAsync(5000);
    expect(pollFn).toHaveBeenCalledTimes(1);
  });
});

describe('formatAlert', () => {
  it('formats with priority prefix [!] for priority 2', () => {
    const result = formatAlert(makeAlert({ priority: 2 }));
    expect(result).toContain('[!]');
    expect(result).toContain('Test Alert');
    expect(result).toContain('Some details here');
  });

  it('uses [!!!] for priority >= 4', () => {
    const result = formatAlert(makeAlert({ priority: 5 }));
    expect(result.startsWith('[!!!]')).toBe(true);
  });

  it('uses [!!] for priority 3', () => {
    const result = formatAlert(makeAlert({ priority: 3 }));
    expect(result.startsWith('[!!]')).toBe(true);
  });

  it('uses [i] for priority <= 1', () => {
    const result = formatAlert(makeAlert({ priority: 1 }));
    expect(result.startsWith('[i]')).toBe(true);
  });

  it('truncates long details to 500 chars', () => {
    const longDetails = 'x'.repeat(600);
    const result = formatAlert(makeAlert({ details: longDetails }));
    expect(result).toContain('...');
    expect(result.length).toBeLessThan(600);
  });

  it('does not truncate short details', () => {
    const result = formatAlert(makeAlert({ details: 'short' }));
    expect(result).not.toContain('...');
    expect(result).toContain('short');
  });
});

describe('alertPriorityValue', () => {
  it('clamps negative values to 0', () => {
    expect(alertPriorityValue(-1)).toBe(0);
  });

  it('clamps values above 5 to 5', () => {
    expect(alertPriorityValue(10)).toBe(5);
  });

  it('passes through values in range', () => {
    expect(alertPriorityValue(3)).toBe(3);
  });
});
