import { describe, it, expect, vi } from 'vitest';

vi.mock('../../security/pii-scrubber.js', () => ({
  scrubPII: vi.fn((text: string) => text),
}));

import { formatCodeResponse } from '../claude-code-formatter.js';
import { scrubPII } from '../../security/pii-scrubber.js';

describe('formatCodeResponse', () => {
  it('truncates telegram output at 4000 chars', () => {
    const long = 'x'.repeat(5000);
    const result = formatCodeResponse(long, 'telegram');
    expect(result.length).toBeLessThanOrEqual(4000);
    expect(result).toContain('... (truncated)');
  });

  it('truncates slack output at 3000 chars', () => {
    const long = 'x'.repeat(4000);
    const result = formatCodeResponse(long, 'slack');
    expect(result.length).toBeLessThanOrEqual(3000);
    expect(result).toContain('... (truncated)');
  });

  it('truncates discord output at 2000 chars', () => {
    const long = 'x'.repeat(3000);
    const result = formatCodeResponse(long, 'discord');
    expect(result.length).toBeLessThanOrEqual(2000);
    expect(result).toContain('... (truncated)');
  });

  it('truncates email output at 10000 chars', () => {
    const long = 'x'.repeat(15000);
    const result = formatCodeResponse(long, 'email');
    expect(result.length).toBeLessThanOrEqual(10000);
    expect(result).toContain('... (truncated)');
  });

  it('returns text as-is when within limit', () => {
    const text = 'Short response';
    const result = formatCodeResponse(text, 'telegram');
    expect(result).toBe('Short response');
  });

  it('redacts sensitive paths', () => {
    const input = 'Found config at /home/user/.sauria/config.json and /tmp/.env.local';
    const result = formatCodeResponse(input, 'telegram');
    expect(result).toContain('[path redacted]');
    expect(result).not.toContain('.sauria/config.json');
    expect(result).not.toContain('.env.local');
  });

  it('calls PII scrubber on output', () => {
    formatCodeResponse('some output', 'telegram');
    expect(scrubPII).toHaveBeenCalled();
  });
});
