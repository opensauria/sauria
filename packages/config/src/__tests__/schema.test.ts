import { describe, it, expect } from 'vitest';
import { SauriaConfigSchema } from '../schema.js';

describe('SauriaConfigSchema', () => {
  describe('minimal config', () => {
    it('parses an empty object with all defaults', () => {
      const result = SauriaConfigSchema.safeParse({});
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.language).toBe('auto');
      expect(result.data.budget.dailyLimitUsd).toBe(5.0);
      expect(result.data.budget.warnAtUsd).toBe(3.0);
      expect(result.data.budget.preferCheap).toBe(true);
    });

    it('applies default model providers', () => {
      const result = SauriaConfigSchema.parse({});
      expect(result.models.extraction.provider).toBe('google');
      expect(result.models.extraction.model).toBe('gemini-2.5-flash');
      expect(result.models.reasoning.provider).toBe('anthropic');
      expect(result.models.reasoning.model).toBe('claude-sonnet-4-5');
      expect(result.models.deep.provider).toBe('anthropic');
      expect(result.models.deep.model).toBe('claude-opus-4-6');
      expect(result.models.embeddings.provider).toBe('local');
      expect(result.models.embeddings.model).toBe('all-MiniLM-L6-v2');
    });

    it('applies default channel settings', () => {
      const result = SauriaConfigSchema.parse({});
      expect(result.channels.telegram.enabled).toBe(false);
      expect(result.channels.telegram.allowedUserIds).toEqual([]);
      expect(result.channels.slack.enabled).toBe(false);
      expect(result.channels.whatsapp.enabled).toBe(false);
      expect(result.channels.discord.enabled).toBe(false);
      expect(result.channels.email.enabled).toBe(false);
    });

    it('applies default orchestrator settings', () => {
      const result = SauriaConfigSchema.parse({});
      expect(result.orchestrator.maxConcurrentWorkspaces).toBe(4);
      expect(result.orchestrator.maxMessagesPerSecond).toBe(10);
      expect(result.orchestrator.routingCacheTtlMs).toBe(300_000);
    });

    it('applies default auth proxy URL', () => {
      const result = SauriaConfigSchema.parse({});
      expect(result.authProxyUrl).toBe('https://auth.sauria.dev');
    });
  });

  describe('full config', () => {
    it('accepts a fully specified config', () => {
      const full = {
        models: {
          extraction: { provider: 'openai', model: 'gpt-4o-mini' },
          reasoning: { provider: 'openai', model: 'gpt-4o' },
          deep: { provider: 'openai', model: 'gpt-4o' },
          embeddings: { provider: 'local', model: 'all-MiniLM-L6-v2' },
        },
        auth: {
          openai: { method: 'encrypted_file' },
        },
        budget: { dailyLimitUsd: 10, warnAtUsd: 7, preferCheap: false },
        mcp: {
          servers: {
            github: { command: 'npx', args: ['@github/mcp'], autoIngest: true, interval: 60 },
          },
        },
        channels: {
          telegram: {
            enabled: true,
            allowedUserIds: [123],
            voice: { enabled: true, model: 'auto', maxDurationSeconds: 60 },
          },
          slack: { enabled: false },
          whatsapp: { enabled: false, webhookPort: 9090 },
          discord: { enabled: false },
          email: { enabled: false, imapPort: 993, smtpPort: 587, tls: true },
        },
        owner: {
          telegram: { userId: 12345 },
        },
        language: 'en',
        orchestrator: {
          maxConcurrentWorkspaces: 8,
          maxMessagesPerSecond: 20,
          routingCacheTtlMs: 60_000,
        },
        integrations: {},
        authProxyUrl: 'https://custom-auth.example.com',
      };
      const result = SauriaConfigSchema.safeParse(full);
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.models.extraction.provider).toBe('openai');
      expect(result.data.budget.dailyLimitUsd).toBe(10);
      expect(result.data.channels.telegram.enabled).toBe(true);
      expect(result.data.owner.telegram?.userId).toBe(12345);
      expect(result.data.language).toBe('en');
    });
  });

  describe('model validation', () => {
    it('rejects an invalid model provider', () => {
      const result = SauriaConfigSchema.safeParse({
        models: {
          extraction: { provider: 'invalid_provider', model: 'test' },
          reasoning: { provider: 'anthropic', model: 'claude-sonnet-4-5' },
          deep: { provider: 'anthropic', model: 'claude-opus-4-6' },
          embeddings: { provider: 'local', model: 'all-MiniLM-L6-v2' },
        },
      });
      expect(result.success).toBe(false);
    });

    it('rejects an empty model name', () => {
      const result = SauriaConfigSchema.safeParse({
        models: {
          extraction: { provider: 'anthropic', model: '' },
          reasoning: { provider: 'anthropic', model: 'claude-sonnet-4-5' },
          deep: { provider: 'anthropic', model: 'claude-opus-4-6' },
          embeddings: { provider: 'local', model: 'all-MiniLM-L6-v2' },
        },
      });
      expect(result.success).toBe(false);
    });

    it('rejects a model name exceeding max length', () => {
      const result = SauriaConfigSchema.safeParse({
        models: {
          extraction: { provider: 'anthropic', model: 'a'.repeat(101) },
          reasoning: { provider: 'anthropic', model: 'claude-sonnet-4-5' },
          deep: { provider: 'anthropic', model: 'claude-opus-4-6' },
          embeddings: { provider: 'local', model: 'all-MiniLM-L6-v2' },
        },
      });
      expect(result.success).toBe(false);
    });

    it('accepts optional baseUrl when valid', () => {
      const result = SauriaConfigSchema.safeParse({
        models: {
          extraction: { provider: 'ollama', model: 'llama3', baseUrl: 'http://localhost:11434' },
          reasoning: { provider: 'anthropic', model: 'claude-sonnet-4-5' },
          deep: { provider: 'anthropic', model: 'claude-opus-4-6' },
          embeddings: { provider: 'local', model: 'all-MiniLM-L6-v2' },
        },
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid baseUrl', () => {
      const result = SauriaConfigSchema.safeParse({
        models: {
          extraction: { provider: 'ollama', model: 'llama3', baseUrl: 'not-a-url' },
          reasoning: { provider: 'anthropic', model: 'claude-sonnet-4-5' },
          deep: { provider: 'anthropic', model: 'claude-opus-4-6' },
          embeddings: { provider: 'local', model: 'all-MiniLM-L6-v2' },
        },
      });
      expect(result.success).toBe(false);
    });
  });

  describe('budget validation', () => {
    it('rejects negative dailyLimitUsd', () => {
      const result = SauriaConfigSchema.safeParse({
        budget: { dailyLimitUsd: -1 },
      });
      expect(result.success).toBe(false);
    });

    it('rejects dailyLimitUsd exceeding 100', () => {
      const result = SauriaConfigSchema.safeParse({
        budget: { dailyLimitUsd: 101 },
      });
      expect(result.success).toBe(false);
    });

    it('accepts boundary value 0 for dailyLimitUsd', () => {
      const result = SauriaConfigSchema.safeParse({
        budget: { dailyLimitUsd: 0 },
      });
      expect(result.success).toBe(true);
    });

    it('accepts boundary value 100 for dailyLimitUsd', () => {
      const result = SauriaConfigSchema.safeParse({
        budget: { dailyLimitUsd: 100 },
      });
      expect(result.success).toBe(true);
    });
  });

  describe('channel validation', () => {
    it('rejects invalid whatsapp webhookPort below 1024', () => {
      const result = SauriaConfigSchema.safeParse({
        channels: {
          telegram: {
            enabled: false,
            allowedUserIds: [],
            voice: { enabled: true, model: 'auto', maxDurationSeconds: 120 },
          },
          slack: { enabled: false },
          whatsapp: { enabled: true, webhookPort: 80 },
          discord: { enabled: false },
          email: { enabled: false, imapPort: 993, smtpPort: 587, tls: true },
        },
      });
      expect(result.success).toBe(false);
    });

    it('rejects whatsapp webhookPort above 65535', () => {
      const result = SauriaConfigSchema.safeParse({
        channels: {
          telegram: {
            enabled: false,
            allowedUserIds: [],
            voice: { enabled: true, model: 'auto', maxDurationSeconds: 120 },
          },
          slack: { enabled: false },
          whatsapp: { enabled: true, webhookPort: 70000 },
          discord: { enabled: false },
          email: { enabled: false, imapPort: 993, smtpPort: 587, tls: true },
        },
      });
      expect(result.success).toBe(false);
    });

    it('applies default voice config for telegram', () => {
      const result = SauriaConfigSchema.parse({});
      expect(result.channels.telegram.voice.enabled).toBe(true);
      expect(result.channels.telegram.voice.model).toBe('auto');
      expect(result.channels.telegram.voice.maxDurationSeconds).toBe(120);
    });

    it('rejects voice maxDurationSeconds exceeding 300', () => {
      const result = SauriaConfigSchema.safeParse({
        channels: {
          telegram: {
            enabled: false,
            allowedUserIds: [],
            voice: { enabled: true, model: 'auto', maxDurationSeconds: 500 },
          },
          slack: { enabled: false },
          whatsapp: { enabled: false, webhookPort: 9090 },
          discord: { enabled: false },
          email: { enabled: false, imapPort: 993, smtpPort: 587, tls: true },
        },
      });
      expect(result.success).toBe(false);
    });
  });

  describe('mcp server validation', () => {
    it('rejects interval below 10', () => {
      const result = SauriaConfigSchema.safeParse({
        mcp: { servers: { test: { command: 'npx', interval: 5 } } },
      });
      expect(result.success).toBe(false);
    });

    it('rejects interval above 86400', () => {
      const result = SauriaConfigSchema.safeParse({
        mcp: { servers: { test: { command: 'npx', interval: 100000 } } },
      });
      expect(result.success).toBe(false);
    });

    it('rejects empty command', () => {
      const result = SauriaConfigSchema.safeParse({
        mcp: { servers: { test: { command: '' } } },
      });
      expect(result.success).toBe(false);
    });
  });

  describe('strict mode', () => {
    it('rejects unknown top-level keys', () => {
      const result = SauriaConfigSchema.safeParse({ unknownKey: 'value' });
      expect(result.success).toBe(false);
    });
  });

  describe('auth validation', () => {
    it('accepts valid auth methods', () => {
      const methods = ['encrypted_file', 'env', 'oauth', 'none'] as const;
      for (const method of methods) {
        const result = SauriaConfigSchema.safeParse({
          auth: { provider: { method } },
        });
        expect(result.success).toBe(true);
      }
    });

    it('rejects invalid auth method', () => {
      const result = SauriaConfigSchema.safeParse({
        auth: { provider: { method: 'plaintext' } },
      });
      expect(result.success).toBe(false);
    });
  });

  describe('owner identity', () => {
    it('accepts owner with telegram userId', () => {
      const result = SauriaConfigSchema.safeParse({
        owner: { telegram: { userId: 99999 } },
      });
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.owner.telegram?.userId).toBe(99999);
    });

    it('rejects invalid email in owner identity', () => {
      const result = SauriaConfigSchema.safeParse({
        owner: { email: { address: 'not-an-email' } },
      });
      expect(result.success).toBe(false);
    });

    it('defaults owner to empty object', () => {
      const result = SauriaConfigSchema.parse({});
      expect(result.owner).toEqual({});
    });
  });
});
