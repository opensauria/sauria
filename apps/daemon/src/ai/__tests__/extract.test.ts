import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../router.js');
vi.mock('../../security/pii-scrubber.js', () => ({
  scrubPII: vi.fn((s: string) => s),
}));
vi.mock('../../security/sanitize.js', () => ({
  sanitizeEntityName: vi.fn((s: string) => s.trim()),
}));
vi.mock('../../utils/logger.js', () => ({
  getLogger: vi.fn(() => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn() })),
}));

import { extractEntities, getExtractionFailureCount } from '../extract.js';

const mockRouter = {
  extract: vi.fn(),
} as unknown as import('../router.js').ModelRouter;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('extractEntities', () => {
  it('returns empty result for blank content', async () => {
    const result = await extractEntities(mockRouter, '   ');
    expect(result).toEqual({ entities: [], relations: [], facts: [] });
    expect(mockRouter.extract).not.toHaveBeenCalled();
  });

  it('calls router.extract with prompt and sanitizes result', async () => {
    vi.mocked(mockRouter.extract).mockResolvedValue({
      entities: [{ name: 'Alice', type: 'person', properties: {} }],
      relations: [{ from: 'Alice', to: 'Bob', type: 'knows', context: '' }],
      facts: [{ fact: 'important', importance: 0.9 }],
    });
    const result = await extractEntities(mockRouter, 'Alice knows Bob');
    expect(result.entities).toHaveLength(1);
    expect(result.entities[0]?.name).toBe('Alice');
    expect(result.relations).toHaveLength(1);
    expect(result.facts).toHaveLength(1);
  });

  it('returns empty result and increments failures on error', async () => {
    const initialCount = getExtractionFailureCount();
    vi.mocked(mockRouter.extract).mockRejectedValue(new Error('API down'));
    const result = await extractEntities(mockRouter, 'some content');
    expect(result).toEqual({ entities: [], relations: [], facts: [] });
    expect(getExtractionFailureCount()).toBe(initialCount + 1);
  });

  it('handles non-Error throws', async () => {
    const initialCount = getExtractionFailureCount();
    vi.mocked(mockRouter.extract).mockRejectedValue('string error');
    const result = await extractEntities(mockRouter, 'content');
    expect(result).toEqual({ entities: [], relations: [], facts: [] });
    expect(getExtractionFailureCount()).toBe(initialCount + 1);
  });
});

describe('getExtractionFailureCount', () => {
  it('returns a number', () => {
    expect(typeof getExtractionFailureCount()).toBe('number');
  });
});
