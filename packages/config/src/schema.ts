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
    model: z.string().default('auto'),
    maxDurationSeconds: z.number().int().min(1).max(300).default(120),
  })
  .default({
    enabled: true,
    model: 'auto',
    maxDurationSeconds: 120,
  });

const SlackChannelSchema = z
  .object({
    enabled: z.boolean().default(false),
    workspaceId: z.string().optional(),
    botUserId: z.string().optional(),
  })
  .default({ enabled: false });

const WhatsAppChannelSchema = z
  .object({
    enabled: z.boolean().default(false),
    phoneNumberId: z.string().optional(),
    webhookPort: z.number().int().min(1024).max(65535).default(9090),
  })
  .default({ enabled: false, webhookPort: 9090 });

const DiscordChannelSchema = z
  .object({
    enabled: z.boolean().default(false),
    guildId: z.string().optional(),
    botUserId: z.string().optional(),
  })
  .default({ enabled: false });

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
  .default({ enabled: false, imapPort: 993, smtpPort: 587, tls: true });

const OwnerIdentitySchema = z
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
  .default({
    maxConcurrentWorkspaces: 4,
    maxMessagesPerSecond: 10,
    routingCacheTtlMs: 300_000,
  });

const ChannelsConfigSchema = z.object({
  telegram: z
    .object({
      enabled: z.boolean().default(false),
      allowedUserIds: z.array(z.number().int()).default([]),
      voice: TelegramVoiceConfigSchema,
    })
    .default({
      enabled: false,
      allowedUserIds: [],
      voice: {
        enabled: true,
        model: 'auto',
        maxDurationSeconds: 120,
      },
    }),
  slack: SlackChannelSchema,
  whatsapp: WhatsAppChannelSchema,
  discord: DiscordChannelSchema,
  email: EmailChannelSchema,
});

const DEFAULT_MODELS = {
  extraction: { provider: 'google' as const, model: 'gemini-2.5-flash' },
  reasoning: { provider: 'anthropic' as const, model: 'claude-sonnet-4-5' },
  deep: { provider: 'anthropic' as const, model: 'claude-opus-4-6' },
  embeddings: { provider: 'local' as const, model: 'all-MiniLM-L6-v2' },
};

export const SauriaConfigSchema = z
  .object({
    models: z
      .object({
        extraction: ModelConfigSchema.default(DEFAULT_MODELS.extraction),
        reasoning: ModelConfigSchema.default(DEFAULT_MODELS.reasoning),
        deep: ModelConfigSchema.default(DEFAULT_MODELS.deep),
        embeddings: ModelConfigSchema.default(DEFAULT_MODELS.embeddings),
      })
      .default(DEFAULT_MODELS),
    auth: z.record(z.string(), AuthConfigSchema).default({}),
    budget: z
      .object({
        dailyLimitUsd: z.number().min(0).max(100).default(5.0),
        warnAtUsd: z.number().min(0).max(100).default(3.0),
        preferCheap: z.boolean().default(true),
      })
      .default({ dailyLimitUsd: 5.0, warnAtUsd: 3.0, preferCheap: true }),
    mcp: z
      .object({
        servers: z.record(z.string(), McpServerConfigSchema).default({}),
      })
      .default({ servers: {} }),
    channels: ChannelsConfigSchema.default({
      telegram: {
        enabled: false,
        allowedUserIds: [],
        voice: {
          enabled: true,
          model: 'auto',
          maxDurationSeconds: 120,
        },
      },
      slack: { enabled: false },
      whatsapp: { enabled: false, webhookPort: 9090 },
      discord: { enabled: false },
      email: { enabled: false, imapPort: 993, smtpPort: 587, tls: true },
    }),
    owner: OwnerIdentitySchema,
    language: z.string().max(30).default('auto'),
    orchestrator: OrchestratorConfigSchema,
    integrations: z
      .record(
        z.string(),
        z.object({
          enabled: z.boolean().default(false),
        }),
      )
      .default({}),
  })
  .strict();

export type SauriaConfig = z.infer<typeof SauriaConfigSchema>;
export type ModelConfig = z.infer<typeof ModelConfigSchema>;
export type AuthConfig = z.infer<typeof AuthConfigSchema>;
export type McpServerConfig = z.infer<typeof McpServerConfigSchema>;
export type OwnerIdentityConfig = z.infer<typeof OwnerIdentitySchema>;
export type OrchestratorConfig = z.infer<typeof OrchestratorConfigSchema>;

export { ModelConfigSchema, AuthConfigSchema, McpServerConfigSchema, ChannelsConfigSchema };
