import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { normalizeRawEvent } from '../normalizer.js';
import type { NormalizedEvent } from '../normalizer.js';

describe('normalizeRawEvent', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-10T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('content extraction priority', () => {
    it('extracts content from body field first', () => {
      const result = normalizeRawEvent('test', {
        body: 'from body',
        content: 'from content',
        text: 'from text',
        description: 'from description',
      });
      expect(result.content).toBe('from body');
    });

    it('falls back to content field when body is missing', () => {
      const result = normalizeRawEvent('test', {
        content: 'from content',
        text: 'from text',
      });
      expect(result.content).toBe('from content');
    });

    it('falls back to text field when body and content are missing', () => {
      const result = normalizeRawEvent('test', { text: 'from text' });
      expect(result.content).toBe('from text');
    });

    it('falls back to description field as last resort', () => {
      const result = normalizeRawEvent('test', {
        description: 'from description',
      });
      expect(result.content).toBe('from description');
    });

    it('returns empty string when no content fields exist', () => {
      const result = normalizeRawEvent('test', {});
      expect(result.content).toBe('');
    });
  });

  describe('HTML stripping', () => {
    it('strips simple HTML tags from content', () => {
      const result = normalizeRawEvent('test', {
        body: '<p>Hello <b>world</b></p>',
      });
      expect(result.content).toBe('Hello world');
    });

    it('strips nested HTML tags', () => {
      const result = normalizeRawEvent('test', {
        body: '<div><span><em>nested</em></span></div>',
      });
      expect(result.content).toBe('nested');
    });

    it('strips self-closing tags', () => {
      const result = normalizeRawEvent('test', {
        body: 'line1<br/>line2<hr/>end',
      });
      expect(result.content).toBe('line1line2end');
    });

    it('handles HTML entities as raw text (not decoded)', () => {
      const result = normalizeRawEvent('test', {
        body: '5 &gt; 3 &amp; 2 &lt; 4',
      });
      expect(result.content).toBe('5 &gt; 3 &amp; 2 &lt; 4');
    });
  });

  describe('whitespace normalization', () => {
    it('collapses multiple spaces into one', () => {
      const result = normalizeRawEvent('test', {
        body: 'hello    world',
      });
      expect(result.content).toBe('hello world');
    });

    it('trims leading and trailing whitespace', () => {
      const result = normalizeRawEvent('test', {
        body: '  hello world  ',
      });
      expect(result.content).toBe('hello world');
    });

    it('normalizes tabs and newlines into single space', () => {
      const result = normalizeRawEvent('test', {
        body: "hello\t\t\nworld",
      });
      expect(result.content).toBe('hello world');
    });
  });

  describe('subject prepending', () => {
    it('prepends subject to content with newline', () => {
      const result = normalizeRawEvent('test', {
        subject: 'Important',
        body: 'Message body',
      });
      expect(result.content).toBe('Important\nMessage body');
    });

    it('does not prepend when subject is absent', () => {
      const result = normalizeRawEvent('test', { body: 'just body' });
      expect(result.content).toBe('just body');
    });
  });

  describe('metadata extraction', () => {
    it('extracts sender, recipient, subject, and date', () => {
      const result = normalizeRawEvent('test', {
        sender: 'alice@test.com',
        recipient: 'bob@test.com',
        subject: 'Meeting',
        date: '2026-03-10',
        body: 'hello',
      });
      expect(result.metadata).toEqual({
        sender: 'alice@test.com',
        recipient: 'bob@test.com',
        subject: 'Meeting',
        date: '2026-03-10',
      });
    });

    it('omits metadata keys with non-string values', () => {
      const result = normalizeRawEvent('test', {
        sender: 42,
        recipient: null,
        body: 'hello',
      });
      expect(result.metadata).toEqual({});
    });

    it('omits metadata keys with empty string values', () => {
      const result = normalizeRawEvent('test', {
        sender: '',
        body: 'hello',
      });
      expect(result.metadata).toEqual({});
    });
  });

  describe('eventType extraction', () => {
    it('extracts from type field', () => {
      const result = normalizeRawEvent('test', {
        type: 'email',
        body: 'hello',
      });
      expect(result.eventType).toBe('email');
    });

    it('falls back to eventType field', () => {
      const result = normalizeRawEvent('test', {
        eventType: 'calendar',
        body: 'hello',
      });
      expect(result.eventType).toBe('calendar');
    });

    it('defaults to unknown when neither type nor eventType exists', () => {
      const result = normalizeRawEvent('test', { body: 'hello' });
      expect(result.eventType).toBe('unknown');
    });
  });

  describe('timestamp extraction', () => {
    it('extracts from date field first', () => {
      const result = normalizeRawEvent('test', {
        date: '2026-01-01T00:00:00Z',
        timestamp: '2026-02-01T00:00:00Z',
        body: 'hello',
      });
      expect(result.timestamp).toBe('2026-01-01T00:00:00Z');
    });

    it('falls back to timestamp field', () => {
      const result = normalizeRawEvent('test', {
        timestamp: '2026-02-01T00:00:00Z',
        body: 'hello',
      });
      expect(result.timestamp).toBe('2026-02-01T00:00:00Z');
    });

    it('falls back to created_at field', () => {
      const result = normalizeRawEvent('test', {
        created_at: '2026-03-01T00:00:00Z',
        body: 'hello',
      });
      expect(result.timestamp).toBe('2026-03-01T00:00:00Z');
    });

    it('defaults to current time when no date fields exist', () => {
      const result = normalizeRawEvent('test', { body: 'hello' });
      expect(result.timestamp).toBe('2026-03-10T12:00:00.000Z');
    });
  });

  describe('source passthrough', () => {
    it('sets source from the provided argument', () => {
      const result = normalizeRawEvent('telegram', { body: 'hello' });
      expect(result.source).toBe('telegram');
    });
  });
});
