import { OpenSauriaConfigSchema } from './schema.js';
import type { OpenSauriaConfig } from './schema.js';

export const DEFAULT_CONFIG: OpenSauriaConfig = OpenSauriaConfigSchema.parse({});

/**
 * Model presets per provider — used by desktop setup wizard.
 * Local presets (ollama, lm-studio, open-webui) require a runtime baseUrl.
 */
export interface ModelPreset {
  readonly provider: string;
  readonly model: string;
  readonly baseUrl?: string;
}

export interface ModelPresetSet {
  readonly extraction: ModelPreset;
  readonly reasoning: ModelPreset;
  readonly deep: ModelPreset;
  readonly embeddings: ModelPreset;
}

const EMBEDDINGS_LOCAL: ModelPreset = { provider: 'local', model: 'all-MiniLM-L6-v2' };

export const CLOUD_PRESETS: Record<string, ModelPresetSet> = {
  anthropic: {
    extraction: { provider: 'google', model: 'gemini-2.5-flash' },
    reasoning: { provider: 'anthropic', model: 'claude-sonnet-4-5' },
    deep: { provider: 'anthropic', model: 'claude-opus-4-6' },
    embeddings: EMBEDDINGS_LOCAL,
  },
  openai: {
    extraction: { provider: 'openai', model: 'gpt-4o-mini' },
    reasoning: { provider: 'openai', model: 'gpt-4o' },
    deep: { provider: 'openai', model: 'gpt-4o' },
    embeddings: EMBEDDINGS_LOCAL,
  },
  google: {
    extraction: { provider: 'google', model: 'gemini-2.5-flash' },
    reasoning: { provider: 'google', model: 'gemini-2.5-pro' },
    deep: { provider: 'google', model: 'gemini-2.5-pro' },
    embeddings: EMBEDDINGS_LOCAL,
  },
};

/**
 * Creates a local provider preset with the given base URL.
 */
export function createLocalPreset(engine: 'ollama' | 'lm-studio' | 'open-webui', baseUrl: string): ModelPresetSet {
  if (engine === 'ollama') {
    return {
      extraction: { provider: 'ollama', model: 'llama3.2', baseUrl },
      reasoning: { provider: 'ollama', model: 'llama3.2', baseUrl },
      deep: { provider: 'ollama', model: 'llama3.2', baseUrl },
      embeddings: EMBEDDINGS_LOCAL,
    };
  }
  const provider = 'openai';
  const model = engine === 'lm-studio' ? 'lm-studio' : 'default';
  return {
    extraction: { provider, model, baseUrl },
    reasoning: { provider, model, baseUrl },
    deep: { provider, model, baseUrl },
    embeddings: EMBEDDINGS_LOCAL,
  };
}
