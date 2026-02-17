import { describe, it, expect } from 'vitest';
import { OpenWindConfigSchema } from '../schema.js';

describe('workspace config schema', () => {
  it('accepts config with ceo identity', () => {
    const config = OpenWindConfigSchema.parse({
      ceo: { telegram: { userId: 123456 } },
    });
    expect(config.ceo.telegram?.userId).toBe(123456);
  });

  it('defaults ceo to empty object', () => {
    const config = OpenWindConfigSchema.parse({});
    expect(config.ceo).toEqual({});
  });

  it('accepts orchestrator config with model tiers', () => {
    const config = OpenWindConfigSchema.parse({
      orchestrator: {
        localModel: { engine: 'ollama', model: 'llama3.2', useGpu: true },
        maxConcurrentWorkspaces: 8,
      },
    });
    expect(config.orchestrator.localModel?.engine).toBe('ollama');
    expect(config.orchestrator.maxConcurrentWorkspaces).toBe(8);
  });

  it('defaults orchestrator settings', () => {
    const config = OpenWindConfigSchema.parse({});
    expect(config.orchestrator.maxConcurrentWorkspaces).toBe(4);
  });
});
