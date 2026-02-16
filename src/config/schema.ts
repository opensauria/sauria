import { z } from 'zod';

const ModelConfigSchema = z.object({
  provider: z.enum([
    'anthropic',
    'openai',
    'google',
    'ollama',
    'openrouter',
    'mistral',
    'groq',
    'together',
    'local',
  ]),
  model: z.string().min(1).max(100),
  baseUrl: z.string().url().optional(),
});

const AuthConfigSchema = z.object({
  method: z.enum(['encrypted_file', 'env', 'none']),
  envVar: z.string().optional(),
});

const McpServerConfigSchema = z.object({
  command: z.string().min(1),
  args: z.array(z.string()).default([]),
  autoIngest: z.boolean().default(false),
  interval: z.number().int().min(10).max(86400).default(300),
});

const ChannelsConfigSchema = z.object({
  telegram: z
    .object({
      enabled: z.boolean().default(false),
      allowedUserIds: z.array(z.number().int()).default([]),
    })
    .default({}),
});

export const OpenWindConfigSchema = z
  .object({
    models: z
      .object({
        extraction: ModelConfigSchema.default({
          provider: 'google',
          model: 'gemini-2.5-flash',
        }),
        reasoning: ModelConfigSchema.default({
          provider: 'anthropic',
          model: 'claude-sonnet-4-5',
        }),
        deep: ModelConfigSchema.default({
          provider: 'anthropic',
          model: 'claude-opus-4-6',
        }),
        embeddings: ModelConfigSchema.default({
          provider: 'local',
          model: 'all-MiniLM-L6-v2',
        }),
      })
      .default({}),
    auth: z.record(z.string(), AuthConfigSchema).default({}),
    budget: z
      .object({
        dailyLimitUsd: z.number().min(0).max(100).default(5.0),
        warnAtUsd: z.number().min(0).max(100).default(3.0),
        preferCheap: z.boolean().default(true),
      })
      .default({}),
    mcp: z
      .object({
        servers: z.record(z.string(), McpServerConfigSchema).default({}),
      })
      .default({}),
    channels: ChannelsConfigSchema.default({}),
  })
  .strict();

export type OpenWindConfig = z.infer<typeof OpenWindConfigSchema>;
export type ModelConfig = z.infer<typeof ModelConfigSchema>;
export type AuthConfig = z.infer<typeof AuthConfigSchema>;
export type McpServerConfig = z.infer<typeof McpServerConfigSchema>;

export {
  ModelConfigSchema,
  AuthConfigSchema,
  McpServerConfigSchema,
  ChannelsConfigSchema,
};
