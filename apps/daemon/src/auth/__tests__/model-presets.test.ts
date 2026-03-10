import { describe, it, expect } from 'vitest';

import { getModelPreset, formatPresetSummary } from '../model-presets.js';

describe('getModelPreset', () => {
  it.each(['anthropic', 'openai', 'google', 'ollama', 'lm-studio', 'open-webui'])(
    'returns a valid preset for %s',
    (provider) => {
      const preset = getModelPreset(provider);
      expect(preset).toBeDefined();
      expect(preset.extraction).toBeDefined();
      expect(preset.reasoning).toBeDefined();
      expect(preset.deep).toBeDefined();
      expect(preset.embeddings).toBeDefined();
    },
  );

  it('each preset slot has provider and model fields', () => {
    const preset = getModelPreset('anthropic');
    for (const slot of [preset.extraction, preset.reasoning, preset.deep, preset.embeddings]) {
      expect(typeof slot.provider).toBe('string');
      expect(slot.provider.length).toBeGreaterThan(0);
      expect(typeof slot.model).toBe('string');
      expect(slot.model.length).toBeGreaterThan(0);
    }
  });

  it('falls back to anthropic preset for unknown providers', () => {
    const unknown = getModelPreset('nonexistent-provider');
    const anthropic = getModelPreset('anthropic');
    expect(unknown).toEqual(anthropic);
  });

  it('all presets include local embeddings', () => {
    for (const provider of ['anthropic', 'openai', 'google', 'ollama']) {
      const preset = getModelPreset(provider);
      expect(preset.embeddings.provider).toBe('local');
    }
  });
});

describe('formatPresetSummary', () => {
  it('returns a multi-line string with all four slots', () => {
    const preset = getModelPreset('anthropic');
    const summary = formatPresetSummary(preset);

    expect(summary).toContain('Extraction:');
    expect(summary).toContain('Reasoning:');
    expect(summary).toContain('Deep:');
    expect(summary).toContain('Embeddings:');
  });

  it('includes provider/model pairs in the output', () => {
    const preset = getModelPreset('openai');
    const summary = formatPresetSummary(preset);

    expect(summary).toContain('openai/gpt-4o-mini');
    expect(summary).toContain('openai/gpt-4o');
  });
});
