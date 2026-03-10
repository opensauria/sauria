import { describe, it, expect, vi } from 'vitest';

vi.mock('../../security/sanitize.js', () => ({
  deepSanitizeStrings: vi.fn((v: unknown) => v),
}));

import { TOOL_DEFS, validateToolInput } from '../tools.js';

describe('TOOL_DEFS', () => {
  it('exports all 11 tool definitions', () => {
    const names = Object.keys(TOOL_DEFS);
    expect(names).toContain('sauria_query');
    expect(names).toContain('sauria_get_entity');
    expect(names).toContain('sauria_search');
    expect(names).toContain('sauria_get_upcoming');
    expect(names).toContain('sauria_get_insights');
    expect(names).toContain('sauria_get_context_for');
    expect(names).toContain('sauria_add_event');
    expect(names).toContain('sauria_remember');
    expect(names).toContain('sauria_pending_approvals');
    expect(names).toContain('sauria_approve');
    expect(names).toContain('sauria_reject');
    expect(names).toHaveLength(11);
  });

  it('each tool has description and schema', () => {
    for (const [, def] of Object.entries(TOOL_DEFS)) {
      expect(typeof def.description).toBe('string');
      expect(def.description.length).toBeGreaterThan(0);
      expect(def.schema).toBeDefined();
    }
  });
});

describe('validateToolInput', () => {
  it('validates sauria_query with valid input', () => {
    const result = validateToolInput('sauria_query', { query: 'test question' });
    expect(result.query).toBe('test question');
  });

  it('rejects sauria_query with empty query', () => {
    expect(() => validateToolInput('sauria_query', { query: '' })).toThrow();
  });

  it('validates sauria_get_entity with valid input', () => {
    const result = validateToolInput('sauria_get_entity', { name: 'Alice' });
    expect(result.name).toBe('Alice');
  });

  it('validates sauria_search with defaults', () => {
    const result = validateToolInput('sauria_search', { query: 'find me' });
    expect(result.query).toBe('find me');
    expect(result.limit).toBe(10);
  });

  it('validates sauria_search with custom limit', () => {
    const result = validateToolInput('sauria_search', { query: 'find', limit: 5 });
    expect(result.limit).toBe(5);
  });

  it('rejects sauria_search with limit > 50', () => {
    expect(() => validateToolInput('sauria_search', { query: 'find', limit: 100 })).toThrow();
  });

  it('validates sauria_get_upcoming with defaults', () => {
    const result = validateToolInput('sauria_get_upcoming', {});
    expect(result.hours).toBe(24);
  });

  it('validates sauria_get_insights with defaults', () => {
    const result = validateToolInput('sauria_get_insights', {});
    expect(result.limit).toBe(5);
  });

  it('validates sauria_get_context_for', () => {
    const result = validateToolInput('sauria_get_context_for', { topic: 'AI' });
    expect(result.topic).toBe('AI');
  });

  it('validates sauria_add_event', () => {
    const result = validateToolInput('sauria_add_event', {
      sourceType: 'manual',
      eventType: 'meeting',
      title: 'Standup',
      content: 'Daily standup notes',
    });
    expect(result.sourceType).toBe('manual');
    expect(result.title).toBe('Standup');
  });

  it('validates sauria_remember with entities and relations', () => {
    const result = validateToolInput('sauria_remember', {
      entities: [{ name: 'Alice', type: 'person' }],
      relations: [{ from: 'Alice', to: 'Bob', type: 'knows' }],
    });
    expect(result.entities).toHaveLength(1);
    expect(result.relations).toHaveLength(1);
  });

  it('validates sauria_remember with empty relations default', () => {
    const result = validateToolInput('sauria_remember', {
      entities: [{ name: 'Alice', type: 'person' }],
    });
    expect(result.relations).toEqual([]);
  });

  it('validates sauria_pending_approvals with empty object', () => {
    const result = validateToolInput('sauria_pending_approvals', {});
    expect(result).toEqual({});
  });

  it('validates sauria_approve', () => {
    const result = validateToolInput('sauria_approve', { approvalId: 'abc-123' });
    expect(result.approvalId).toBe('abc-123');
  });

  it('validates sauria_reject', () => {
    const result = validateToolInput('sauria_reject', { approvalId: 'xyz' });
    expect(result.approvalId).toBe('xyz');
  });

  it('rejects invalid entity type in sauria_remember', () => {
    expect(() =>
      validateToolInput('sauria_remember', {
        entities: [{ name: 'X', type: 'invalid_type' }],
      }),
    ).toThrow();
  });
});
