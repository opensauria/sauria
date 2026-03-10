import { describe, it, expect } from 'vitest';
import {
  CANARY_TOKEN,
  ExtractionResponseSchema,
  parseAIResponse,
  MalformedResponseError,
  InjectionDetectedError,
} from '../anti-injection.js';

const validExtraction = {
  entities: [
    { name: 'Alice', type: 'person' },
    { name: 'Acme Corp', type: 'company', properties: { industry: 'tech' } },
  ],
  relations: [{ from: 'Alice', to: 'Acme Corp', type: 'works_at' }],
  facts: [{ fact: 'Alice is a senior engineer', importance: 0.8 }],
};

describe('CANARY_TOKEN', () => {
  it('has the expected value', () => {
    expect(CANARY_TOKEN).toBe('BANANA_SPLIT_7742');
  });
});

describe('ExtractionResponseSchema', () => {
  it('accepts valid extraction data', () => {
    const result = ExtractionResponseSchema.safeParse(validExtraction);
    expect(result.success).toBe(true);
  });

  it('accepts minimal valid data with empty arrays', () => {
    const result = ExtractionResponseSchema.safeParse({
      entities: [],
      relations: [],
      facts: [],
    });
    expect(result.success).toBe(true);
  });

  it('rejects entity name exceeding 200 characters', () => {
    const result = ExtractionResponseSchema.safeParse({
      entities: [{ name: 'x'.repeat(201), type: 'person' }],
      relations: [],
      facts: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects more than 50 entities', () => {
    const entities = Array.from({ length: 51 }, (_, i) => ({
      name: `Entity ${i}`,
      type: 'person' as const,
    }));
    const result = ExtractionResponseSchema.safeParse({
      entities,
      relations: [],
      facts: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects more than 100 relations', () => {
    const relations = Array.from({ length: 101 }, (_, i) => ({
      from: `A${i}`,
      to: `B${i}`,
      type: 'related',
    }));
    const result = ExtractionResponseSchema.safeParse({
      entities: [],
      relations,
      facts: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects more than 20 facts', () => {
    const facts = Array.from({ length: 21 }, (_, i) => ({
      fact: `Fact ${i}`,
      importance: 0.5,
    }));
    const result = ExtractionResponseSchema.safeParse({
      entities: [],
      relations: [],
      facts,
    });
    expect(result.success).toBe(false);
  });

  it('rejects importance below 0', () => {
    const result = ExtractionResponseSchema.safeParse({
      entities: [],
      relations: [],
      facts: [{ fact: 'test', importance: -0.1 }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects importance above 1', () => {
    const result = ExtractionResponseSchema.safeParse({
      entities: [],
      relations: [],
      facts: [{ fact: 'test', importance: 1.1 }],
    });
    expect(result.success).toBe(false);
  });

  it('accepts importance at boundary values 0 and 1', () => {
    const result = ExtractionResponseSchema.safeParse({
      entities: [],
      relations: [],
      facts: [
        { fact: 'low', importance: 0 },
        { fact: 'high', importance: 1 },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid entity type', () => {
    const result = ExtractionResponseSchema.safeParse({
      entities: [{ name: 'Test', type: 'invalid_type' }],
      relations: [],
      facts: [],
    });
    expect(result.success).toBe(false);
  });
});

describe('parseAIResponse', () => {
  it('extracts valid JSON response', () => {
    const raw = JSON.stringify(validExtraction);
    const result = parseAIResponse(raw);
    expect(result.entities).toHaveLength(2);
    expect(result.relations).toHaveLength(1);
    expect(result.facts).toHaveLength(1);
    expect(result.entities[0]?.name).toBe('Alice');
  });

  it('strips markdown json fencing', () => {
    const raw = '```json\n' + JSON.stringify(validExtraction) + '\n```';
    const result = parseAIResponse(raw);
    expect(result.entities).toHaveLength(2);
  });

  it('strips markdown fencing without language tag', () => {
    const raw = '```\n' + JSON.stringify(validExtraction) + '\n```';
    const result = parseAIResponse(raw);
    expect(result.entities).toHaveLength(2);
  });

  it('throws InjectionDetectedError when canary token is present', () => {
    const payload = { ...validExtraction, note: CANARY_TOKEN };
    const raw = JSON.stringify(payload);
    expect(() => parseAIResponse(raw)).toThrow(InjectionDetectedError);
  });

  it('throws InjectionDetectedError for canary token inside markdown fencing', () => {
    const raw =
      '```json\n{"entities":[],"relations":[],"facts":[],"x":"' + CANARY_TOKEN + '"}\n```';
    expect(() => parseAIResponse(raw)).toThrow(InjectionDetectedError);
  });

  it('throws MalformedResponseError for invalid JSON', () => {
    expect(() => parseAIResponse('not json at all')).toThrow(MalformedResponseError);
    expect(() => parseAIResponse('{broken')).toThrow(MalformedResponseError);
  });

  it('includes "Invalid JSON" in error message for unparseable input', () => {
    try {
      parseAIResponse('not json');
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(MalformedResponseError);
      expect((err as MalformedResponseError).message).toContain('Invalid JSON');
    }
  });

  it('throws MalformedResponseError with details on schema validation failure', () => {
    const raw = JSON.stringify({ entities: 'not an array', relations: [], facts: [] });
    try {
      parseAIResponse(raw);
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(MalformedResponseError);
      expect((err as MalformedResponseError).message).toContain('Schema validation failed');
    }
  });
});

describe('MalformedResponseError', () => {
  it('has correct name property', () => {
    const error = new MalformedResponseError('test reason');
    expect(error.name).toBe('MalformedResponseError');
  });

  it('includes reason in message', () => {
    const error = new MalformedResponseError('test reason');
    expect(error.message).toBe('AI response is malformed: test reason');
  });

  it('is an instance of Error', () => {
    const error = new MalformedResponseError('test');
    expect(error).toBeInstanceOf(Error);
  });
});

describe('InjectionDetectedError', () => {
  it('has correct name property', () => {
    const error = new InjectionDetectedError();
    expect(error.name).toBe('InjectionDetectedError');
  });

  it('has correct message', () => {
    const error = new InjectionDetectedError();
    expect(error.message).toBe('Canary token detected in AI response — possible prompt injection');
  });

  it('is an instance of Error', () => {
    const error = new InjectionDetectedError();
    expect(error).toBeInstanceOf(Error);
  });
});
