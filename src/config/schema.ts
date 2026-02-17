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
  method: z.enum(['encrypted_file', 'env', 'oauth', 'none']),
  envVar: z.string().optional(),
});

const McpServerConfigSchema = z.object({
  command: z.string().min(1),
  args: z.array(z.string()).default([]),
  autoIngest: z.boolean().default(false),
  interval: z.number().int().min(10).max(86400).default(300),
});

const TelegramVoiceConfigSchema = z
  .object({
    enabled: z.boolean().default(true),
    model: z.string().default('onnx-community/whisper-small'),
    maxDurationSeconds: z.number().int().min(1).max(300).default(120),
  })
  .default({});

const SlackChannelSchema = z
  .object({
    enabled: z.boolean().default(false),
    workspaceId: z.string().optional(),
    botUserId: z.string().optional(),
  })
  .default({});

const WhatsAppChannelSchema = z
  .object({
    enabled: z.boolean().default(false),
    phoneNumberId: z.string().optional(),
  })
  .default({});

const DiscordChannelSchema = z
  .object({
    enabled: z.boolean().default(false),
    guildId: z.string().optional(),
    botUserId: z.string().optional(),
  })
  .default({});

const EmailChannelSchema = z
  .object({
    enabled: z.boolean().default(false),
    imapHost: z.string().optional(),
    imapPort: z.number().int().min(1).max(65535).default(993),
    smtpHost: z.string().optional(),
    smtpPort: z.number().int().min(1).max(65535).default(587),
    username: z.string().optional(),
    tls: z.boolean().default(true),
  })
  .default({});

const CEOIdentitySchema = z
  .object({
    telegram: z.object({ userId: z.number().int() }).optional(),
    slack: z.object({ userId: z.string() }).optional(),
    whatsapp: z.object({ phoneNumber: z.string() }).optional(),
    discord: z.object({ userId: z.string() }).optional(),
    email: z.object({ address: z.string().email() }).optional(),
  })
  .default({});

const LocalModelSchema = z.object({
  engine: z.enum(['ollama', 'llamacpp', 'mlx']),
  model: z.string().min(1),
  useGpu: z.boolean().default(true),
});

const OrchestratorConfigSchema = z
  .object({
    localModel: LocalModelSchema.optional(),
    maxConcurrentWorkspaces: z.number().int().min(1).max(32).default(4),
    maxMessagesPerSecond: z.number().int().min(1).max(100).default(10),
    routingCacheTtlMs: z.number().int().min(0).max(600_000).default(300_000),
  })
  .default({});

const ChannelsConfigSchema = z.object({
  telegram: z
    .object({
      enabled: z.boolean().default(false),
      allowedUserIds: z.array(z.number().int()).default([]),
      voice: TelegramVoiceConfigSchema,
    })
    .default({}),
  slack: SlackChannelSchema,
  whatsapp: WhatsAppChannelSchema,
  discord: DiscordChannelSchema,
  email: EmailChannelSchema,
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
    ceo: CEOIdentitySchema,
    orchestrator: OrchestratorConfigSchema,
  })
  .strict();

export type OpenWindConfig = z.infer<typeof OpenWindConfigSchema>;
export type ModelConfig = z.infer<typeof ModelConfigSchema>;
export type AuthConfig = z.infer<typeof AuthConfigSchema>;
export type McpServerConfig = z.infer<typeof McpServerConfigSchema>;
export type CEOIdentityConfig = z.infer<typeof CEOIdentitySchema>;
export type OrchestratorConfig = z.infer<typeof OrchestratorConfigSchema>;

export { ModelConfigSchema, AuthConfigSchema, McpServerConfigSchema, ChannelsConfigSchema };
