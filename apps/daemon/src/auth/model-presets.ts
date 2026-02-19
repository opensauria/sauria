import type { ModelConfig } from '../config/schema.js';

interface ModelPreset {
  readonly extraction: ModelConfig;
  readonly reasoning: ModelConfig;
  readonly deep: ModelConfig;
  readonly embeddings: ModelConfig;
}

const PRESETS: Readonly<Record<string, ModelPreset>> = {
  anthropic: {
    extraction: { provider: 'google', model: 'gemini-2.5-flash' },
    reasoning: { provider: 'anthropic', model: 'claude-sonnet-4-5' },
    deep: { provider: 'anthropic', model: 'claude-opus-4-6' },
    embeddings: { provider: 'local', model: 'all-MiniLM-L6-v2' },
  },
  openai: {
    extraction: { provider: 'openai', model: 'gpt-4o-mini' },
    reasoning: { provider: 'openai', model: 'gpt-4o' },
    deep: { provider: 'openai', model: 'gpt-4o' },
    embeddings: { provider: 'local', model: 'all-MiniLM-L6-v2' },
  },
  google: {
    extraction: { provider: 'google', model: 'gemini-2.5-flash' },
    reasoning: { provider: 'google', model: 'gemini-2.5-pro' },
    deep: { provider: 'google', model: 'gemini-2.5-pro' },
    embeddings: { provider: 'local', model: 'all-MiniLM-L6-v2' },
  },
  ollama: {
    extraction: { provider: 'ollama', model: 'llama3.2' },
    reasoning: { provider: 'ollama', model: 'llama3.2' },
    deep: { provider: 'ollama', model: 'llama3.2' },
    embeddings: { provider: 'local', model: 'all-MiniLM-L6-v2' },
  },
  'lm-studio': {
    extraction: { provider: 'openai', model: 'lm-studio' },
    reasoning: { provider: 'openai', model: 'lm-studio' },
    deep: { provider: 'openai', model: 'lm-studio' },
    embeddings: { provider: 'local', model: 'all-MiniLM-L6-v2' },
  },
  'open-webui': {
    extraction: { provider: 'openai', model: 'default' },
    reasoning: { provider: 'openai', model: 'default' },
    deep: { provider: 'openai', model: 'default' },
    embeddings: { provider: 'local', model: 'all-MiniLM-L6-v2' },
  },
};

const DEFAULT_PRESET = PRESETS['anthropic']!;

export function getModelPreset(providerName: string): ModelPreset {
  return PRESETS[providerName] ?? DEFAULT_PRESET;
}

export function formatPresetSummary(preset: ModelPreset): string {
  return [
    `  Extraction:  ${preset.extraction.provider}/${preset.extraction.model}`,
    `  Reasoning:   ${preset.reasoning.provider}/${preset.reasoning.model}`,
    `  Deep:        ${preset.deep.provider}/${preset.deep.model}`,
    `  Embeddings:  ${preset.embeddings.provider}/${preset.embeddings.model}`,
  ].join('\n');
}
