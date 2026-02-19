import { describe, it, expect } from 'vitest';
import { OpenSauriaConfigSchema } from '../schema.js';

describe('workspace config schema', () => {
  it('accepts config with owner identity', () => {
    const config = OpenSauriaConfigSchema.parse({
      owner: { telegram: { userId: 123456 } },
    });
    expect(config.owner.telegram?.userId).toBe(123456);
  });

  it('defaults owner to empty object', () => {
    const config = OpenSauriaConfigSchema.parse({});
    expect(config.owner).toEqual({});
  });

  it('accepts orchestrator config with model tiers', () => {
    const config = OpenSauriaConfigSchema.parse({
      orchestrator: {
        localModel: { engine: 'ollama', model: 'llama3.2', useGpu: true },
        maxConcurrentWorkspaces: 8,
      },
    });
    expect(config.orchestrator.localModel?.engine).toBe('ollama');
    expect(config.orchestrator.maxConcurrentWorkspaces).toBe(8);
  });

  it('defaults orchestrator settings', () => {
    const config = OpenSauriaConfigSchema.parse({});
    expect(config.orchestrator.maxConcurrentWorkspaces).toBe(4);
  });
});
