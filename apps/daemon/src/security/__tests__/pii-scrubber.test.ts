import { describe, it, expect } from 'vitest';

import { PII_PATTERNS, scrubPII } from '../pii-scrubber.js';

describe('scrubPII', () => {
  it('redacts SSN', () => {
    expect(scrubPII('My SSN is 123-45-6789')).toBe('My SSN is [SSN_REDACTED]');
  });

  it('redacts credit card with spaces', () => {
    expect(scrubPII('Card: 4111 1111 1111 1111')).toBe('Card: [CC_REDACTED]');
  });

  it('redacts credit card with dashes', () => {
    expect(scrubPII('Card: 4111-1111-1111-1111')).toBe('Card: [CC_REDACTED]');
  });

  it('redacts credit card without separators', () => {
    expect(scrubPII('Card: 4111111111111111')).toBe('Card: [CC_REDACTED]');
  });

  it('redacts international phone number', () => {
    expect(scrubPII('Call +1-555-555-5555')).toBe('Call [PHONE_REDACTED]');
  });

  it('redacts email address', () => {
    expect(scrubPII('Email me at user@example.com please')).toBe(
      'Email me at [EMAIL_REDACTED] please',
    );
  });

  it('redacts API keys (sk prefix with 20+ alphanumeric chars)', () => {
    const key = 'sk' + 'a'.repeat(22);
    expect(scrubPII(`Key: ${key}`)).toBe('Key: [KEY_REDACTED]');
  });

  it('redacts IBAN', () => {
    expect(scrubPII('IBAN: GB82WEST12345698765432')).toBe('IBAN: [IBAN_REDACTED]');
  });

  it('redacts multiple PII in one string', () => {
    const input = 'SSN 123-45-6789 and email test@example.com';
    const result = scrubPII(input);
    expect(result).toContain('[SSN_REDACTED]');
    expect(result).toContain('[EMAIL_REDACTED]');
    expect(result).not.toContain('123-45-6789');
    expect(result).not.toContain('test@example.com');
  });

  it('does not false positive on short numbers', () => {
    expect(scrubPII('I have 12345 items')).toBe('I have 12345 items');
  });

  it('preserves non-PII text', () => {
    const input = 'This is a normal sentence with no sensitive data.';
    expect(scrubPII(input)).toBe(input);
  });

  it('handles empty string', () => {
    expect(scrubPII('')).toBe('');
  });
});

describe('PII_PATTERNS', () => {
  it('contains all 6 pattern entries', () => {
    expect(PII_PATTERNS).toHaveLength(6);
  });

  it('has expected pattern names', () => {
    const names = PII_PATTERNS.map((p) => p.name);
    expect(names).toContain('ssn');
    expect(names).toContain('credit_card');
    expect(names).toContain('phone_intl');
    expect(names).toContain('email_in_body');
    expect(names).toContain('api_key');
    expect(names).toContain('iban');
  });

  it('has replacement strings for all patterns', () => {
    for (const pattern of PII_PATTERNS) {
      expect(pattern.replacement).toBeTruthy();
      expect(pattern.replacement.startsWith('[')).toBe(true);
      expect(pattern.replacement.endsWith(']')).toBe(true);
    }
  });

  it('redacts token-style API key', () => {
    const key = 'token_' + 'x'.repeat(25);
    expect(scrubPII(key)).toBe('[KEY_REDACTED]');
  });

  it('redacts secret-style API key', () => {
    const key = 'secret_' + 'A'.repeat(22);
    expect(scrubPII(key)).toBe('[KEY_REDACTED]');
  });

  it('redacts phone with dots', () => {
    expect(scrubPII('Phone: +44.7911.123456')).toBe('Phone: [PHONE_REDACTED]');
  });

  it('does not redact short key-like strings', () => {
    // "sk_abc" is only 6 chars after prefix, well under 20
    expect(scrubPII('sk_abc')).toBe('sk_abc');
  });
});
