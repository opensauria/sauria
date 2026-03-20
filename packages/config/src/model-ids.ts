/**
 * Canonical model IDs — single source of truth for all default model references.
 * Update these when upgrading to newer model versions.
 *
 * Anthropic: https://platform.claude.com/docs/en/docs/about-claude/models/overview
 */
export const MODEL_IDS = {
  anthropic: {
    reasoning: 'claude-sonnet-4-6',
    deep: 'claude-opus-4-6',
  },
  google: {
    extraction: 'gemini-2.5-flash',
    reasoning: 'gemini-2.5-pro',
  },
  openai: {
    extraction: 'gpt-4o-mini',
    reasoning: 'gpt-4o',
  },
  local: {
    embeddings: 'all-MiniLM-L6-v2',
  },
  ollama: {
    default: 'llama3.2',
  },
} as const;
