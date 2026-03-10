import { describe, it, expect } from 'vitest';
import { textResult, formatEntity, isObservationRow } from '../server-helpers.js';
import type { Entity, EntityType } from '../../db/types.js';

function makeEntity(overrides: Partial<Entity> = {}): Entity {
  return {
    id: 'ent-1',
    type: 'person' as EntityType,
    name: 'Alice',
    summary: 'A test entity',
    properties: null,
    importanceScore: 5,
    firstSeenAt: '2026-01-01T00:00:00Z',
    lastUpdatedAt: '2026-01-02T00:00:00Z',
    lastMentionedAt: null,
    mentionCount: 3,
    ...overrides,
  };
}

describe('textResult', () => {
  it('wraps text in MCP content format', () => {
    const result = textResult('hello');
    expect(result).toEqual({
      content: [{ type: 'text', text: 'hello' }],
    });
  });

  it('truncates responses exceeding 100KB', () => {
    const longText = 'a'.repeat(200 * 1024);
    const result = textResult(longText);
    const text = result.content[0]?.text ?? '';
    expect(text.length).toBeLessThanOrEqual(100 * 1024 + 20);
    expect(text).toContain('...[truncated]');
  });

  it('does not truncate responses under 100KB', () => {
    const shortText = 'hello world';
    const result = textResult(shortText);
    expect(result.content[0]?.text).toBe(shortText);
  });
});

describe('formatEntity', () => {
  it('includes type, name, and id', () => {
    const result = formatEntity(makeEntity());
    expect(result).toContain('[person]');
    expect(result).toContain('Alice');
    expect(result).toContain('ent-1');
  });

  it('includes summary when present', () => {
    const result = formatEntity(makeEntity({ summary: 'Important person' }));
    expect(result).toContain('Summary: Important person');
  });

  it('omits summary line when null', () => {
    const result = formatEntity(makeEntity({ summary: null }));
    expect(result).not.toContain('Summary:');
  });

  it('includes importance and mention count', () => {
    const result = formatEntity(makeEntity({ importanceScore: 8, mentionCount: 12 }));
    expect(result).toContain('Importance: 8');
    expect(result).toContain('Mentions: 12');
  });

  it('renders properties when present', () => {
    const result = formatEntity(
      makeEntity({ properties: { role: 'engineer', team: 'backend' } }),
    );
    expect(result).toContain('Properties:');
    expect(result).toContain('role: engineer');
    expect(result).toContain('team: backend');
  });

  it('omits properties section when null', () => {
    const result = formatEntity(makeEntity({ properties: null }));
    expect(result).not.toContain('Properties:');
  });
});

describe('isObservationRow', () => {
  it('returns true for valid observation row', () => {
    expect(
      isObservationRow({ content: 'likes coffee', created_at: '2026-01-01' }),
    ).toBe(true);
  });

  it('returns false for null', () => {
    expect(isObservationRow(null)).toBe(false);
  });

  it('returns false for arrays', () => {
    expect(isObservationRow([1, 2])).toBe(false);
  });

  it('returns false when content is missing', () => {
    expect(isObservationRow({ created_at: '2026-01-01' })).toBe(false);
  });

  it('returns false when created_at is missing', () => {
    expect(isObservationRow({ content: 'test' })).toBe(false);
  });

  it('returns false for primitives', () => {
    expect(isObservationRow(42)).toBe(false);
    expect(isObservationRow('string')).toBe(false);
  });
});
