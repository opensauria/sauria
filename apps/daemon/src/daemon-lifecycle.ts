import {
  readFileSync,
  writeFileSync,
  existsSync,
  unlinkSync,
  watch,
  type FSWatcher,
} from 'node:fs';
import type BetterSqlite3 from 'better-sqlite3';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { openDatabase, closeDatabase } from './db/connection.js';
import { applySchema } from './db/schema.js';
import { loadConfig } from './config/loader.js';
import { ensureConfigDir } from './config/loader.js';
import type { OpenSauriaConfig } from './config/schema.js';
import { AuditLogger } from './security/audit.js';
import { runSecurityChecks } from './security/startup-checks.js';
import { ModelRouter } from './ai/router.js';
import { resolveApiKey } from './auth/resolve.js';
import { refreshOAuthTokenIfNeeded } from './auth/oauth.js';
import { McpClientManager } from './mcp/client.js';
import { ProactiveEngine } from './engine/proactive.js';
import type { Channel } from './channels/base.js';
import { TelegramChannel } from './channels/telegram.js';
import { SlackChannel } from './channels/slack.js';
import { DiscordChannel } from './channels/discord.js';
import { EmailChannel } from './channels/email.js';
import { TranscriptionService } from './channels/transcription.js';
import { IngestPipeline } from './ingestion/pipeline.js';
import { createLimiter, SECURITY_LIMITS } from './security/rate-limiter.js';
import { vaultGet } from './security/vault-key.js';
import { startMcpServer } from './mcp/server.js';
import { getLogger } from './utils/logger.js';
import { recordSpend, isOverBudget } from './utils/budget.js';
import { paths } from './config/paths.js';
import { startIpcServer, type DaemonIpcServer } from './daemon-ipc.js';
import { ChannelRegistry } from './channels/registry.js';
import { AgentOrchestrator } from './orchestrator/orchestrator.js';
import { LLMRoutingBrain } from './orchestrator/llm-router.js';
import { MessageQueue } from './orchestrator/message-queue.js';
import { AgentMemory } from './orchestrator/agent-memory.js';
import { KPITracker } from './orchestrator/kpi-tracker.js';
import { CheckpointManager } from './orchestrator/checkpoint.js';
import type {
  CanvasGraph,
  OwnerIdentity,
  OwnerCommand,
  AgentNode,
  InboundMessage,
  Edge,
  Workspace,
  AutonomyLevel,
  AgentRole,
} from './orchestrator/types.js';
import {
  createEmptyGraph,
  DEFAULT_GROUP_BEHAVIOR,
  OwnerCommandSchema,
} from './orchestrator/types.js';

export interface DaemonContext {
  readonly db: BetterSqlite3.Database;
  readonly config: OpenSauriaConfig;
  readonly audit: AuditLogger;
  readonly router: ModelRouter;
  readonly mcpClients: McpClientManager;
  readonly engine: ProactiveEngine;
  readonly mcpServer: McpServer;
  readonly refreshInterval: ReturnType<typeof setInterval>;
  readonly registry: ChannelRegistry | null;
  readonly orchestrator: AgentOrchestrator | null;
  readonly queue: MessageQueue | null;
  readonly ipcServer: DaemonIpcServer;
  readonly canvasWatcher: FSWatcher | null;
  readonly ownerCommandWatcher: FSWatcher | null;
}

async function connectMcpSources(
  config: OpenSauriaConfig,
  mcpClients: McpClientManager,
): Promise<void> {
  const logger = getLogger();
  const serverEntries = Object.entries(config.mcp.servers);

  for (const [name, serverConfig] of serverEntries) {
    if (!serverConfig) continue;
    try {
      await mcpClients.connect({
        name,
        command: serverConfig.command,
        args: [...serverConfig.args],
      });
      logger.info(`MCP client connected: ${name}`);
    } catch (err: unknown) {
      logger.error(`Failed to connect MCP client: ${name}`, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

// ─── Canvas Graph Loading ─────────────────────────────────────────────

// ─── Raw types from desktop canvas (simplified schema) ───────────────
interface RawNode {
  readonly id: string;
  readonly platform: string;
  readonly label: string;
  readonly photo: string | null;
  readonly position: { readonly x: number; readonly y: number };
  readonly status: string;
  readonly credentials: string;
  readonly meta: Record<string, string>;
  readonly workspaceId?: string | null;
  readonly role?: string;
  readonly autonomy?: string | number;
  readonly instructions?: string;
  readonly groupBehavior?: AgentNode['groupBehavior'];
}

interface RawEdge {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly label?: string;
  readonly edgeType?: Edge['edgeType'];
  readonly rules?: Edge['rules'];
}

interface RawWorkspace {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  readonly purpose: string;
  readonly topics: readonly string[];
  readonly budget: number | Workspace['budget'];
  readonly position: { readonly x: number; readonly y: number };
  readonly size: {
    readonly w?: number;
    readonly h?: number;
    readonly width?: number;
    readonly height?: number;
  };
  readonly checkpoints?: Workspace['checkpoints'];
  readonly groups?: Workspace['groups'];
  readonly models?: Workspace['models'];
}

interface RawGraph {
  readonly version?: number;
  readonly globalInstructions?: string;
  readonly nodes?: readonly RawNode[];
  readonly edges?: readonly RawEdge[];
  readonly workspaces?: readonly RawWorkspace[];
  readonly viewport?: { readonly x: number; readonly y: number; readonly zoom: number };
}

const VALID_AUTONOMY_LEVELS = new Set<string>(['full', 'supervised', 'approval', 'manual']);
const VALID_ROLES = new Set<string>(['lead', 'specialist', 'observer', 'coordinator', 'assistant']);
const VALID_STATUSES = new Set<string>(['connected', 'disconnected', 'error']);

function normalizeNode(raw: RawNode): AgentNode {
  let autonomy: AutonomyLevel = 'supervised';
  if (typeof raw.autonomy === 'string' && VALID_AUTONOMY_LEVELS.has(raw.autonomy)) {
    autonomy = raw.autonomy as AutonomyLevel;
  }

  const role: AgentRole =
    typeof raw.role === 'string' && VALID_ROLES.has(raw.role)
      ? (raw.role as AgentRole)
      : 'assistant';

  const status = VALID_STATUSES.has(raw.status)
    ? (raw.status as AgentNode['status'])
    : 'disconnected';

  return {
    id: raw.id,
    platform: raw.platform as AgentNode['platform'],
    label: raw.label,
    photo: raw.photo,
    position: raw.position,
    status,
    credentials: raw.credentials,
    meta: raw.meta,
    workspaceId: raw.workspaceId ?? null,
    role,
    autonomy,
    instructions: raw.instructions ?? '',
    groupBehavior: raw.groupBehavior ?? DEFAULT_GROUP_BEHAVIOR,
  };
}

function normalizeEdge(raw: RawEdge): Edge {
  return {
    id: raw.id,
    from: raw.from,
    to: raw.to,
    label: raw.label,
    edgeType: raw.edgeType ?? 'manual',
    rules: raw.rules ?? [{ type: 'always', action: 'forward' }],
  };
}

function normalizeWorkspace(raw: RawWorkspace): Workspace {
  const width = raw.size.width ?? raw.size.w ?? 400;
  const height = raw.size.height ?? raw.size.h ?? 320;

  const budget: Workspace['budget'] =
    typeof raw.budget === 'number' ? { dailyLimitUsd: raw.budget, preferCheap: true } : raw.budget;

  return {
    id: raw.id,
    name: raw.name,
    color: raw.color,
    purpose: raw.purpose,
    topics: [...raw.topics],
    budget,
    position: raw.position,
    size: { width, height },
    checkpoints: raw.checkpoints ?? [],
    groups: raw.groups ?? [],
    models: raw.models,
  };
}

function loadCanvasGraph(): CanvasGraph {
  if (!existsSync(paths.canvas)) {
    return createEmptyGraph();
  }
  try {
    const raw = readFileSync(paths.canvas, 'utf-8');
    const parsed = JSON.parse(raw) as RawGraph;
    return {
      version: 2,
      globalInstructions:
        typeof parsed.globalInstructions === 'string' ? parsed.globalInstructions : '',
      nodes: (parsed.nodes ?? []).map(normalizeNode),
      edges: (parsed.edges ?? []).map(normalizeEdge),
      workspaces: (parsed.workspaces ?? []).map(normalizeWorkspace),
      viewport: parsed.viewport ?? { x: 0, y: 0, zoom: 1 },
    };
  } catch {
    return createEmptyGraph();
  }
}

function buildOwnerIdentity(config: OpenSauriaConfig): OwnerIdentity {
  return {
    telegram: config.owner.telegram,
    slack: config.owner.slack,
    whatsapp: config.owner.whatsapp,
  };
}

// ─── Channel Factory ──────────────────────────────────────────────────

async function createChannelForNode(
  node: AgentNode,
  deps: {
    db: BetterSqlite3.Database;
    router: ModelRouter;
    audit: AuditLogger;
    config: OpenSauriaConfig;
    onInbound: (message: InboundMessage) => void;
    globalInstructions: string;
  },
): Promise<Channel | null> {
  const logger = getLogger();
  const { db, router, audit, config, onInbound, globalInstructions } = deps;

  const platformName = node.platform.charAt(0).toUpperCase() + node.platform.slice(1);
  const displayName = node.meta?.['firstName'] || node.label.replace(/^@/, '') || node.label;
  const personaBlock = [
    `Your name is ${displayName}.`,
    `You are a ${node.role ?? 'assistant'} agent on ${platformName}.`,
    `Always respond as ${displayName}. Never say you are Claude, an AI assistant, or a language model.`,
  ].join(' ');

  const combinedInstructions = [personaBlock, globalInstructions, node.instructions]
    .filter(Boolean)
    .join('\n\n');

  const nodeToken = await vaultGet(`channel_token_${node.id}`);

  if (node.platform === 'telegram') {
    const token = nodeToken;
    if (!token) {
      logger.warn(`Skipping node ${node.id}: no telegram token in vault`);
      return null;
    }

    const { voice } = config.channels.telegram;
    const transcription = voice.enabled
      ? new TranscriptionService({
          model: voice.model,
          maxDurationSeconds: voice.maxDurationSeconds,
        })
      : null;

    const pipeline = new IngestPipeline(
      db,
      router,
      audit,
      createLimiter(`tg_ingest_${node.id}`, SECURITY_LIMITS.ingestion.maxEventsPerHour, 3_600_000),
    );

    const ownerTelegramId = config.owner.telegram?.userId;
    const nodeUserId =
      typeof node.meta?.['userId'] === 'string' ? Number(node.meta['userId']) : undefined;
    const configUserIds = config.channels.telegram.allowedUserIds;
    const allowedUserIds =
      configUserIds.length > 0 ? configUserIds : nodeUserId ? [nodeUserId] : [];

    return new TelegramChannel({
      token,
      allowedUserIds,
      db,
      router,
      audit,
      pipeline,
      transcription,
      nodeId: node.id,
      ownerId: ownerTelegramId ?? nodeUserId,
      onInbound,
      instructions: combinedInstructions,
    });
  }

  if (node.platform === 'slack') {
    const token = nodeToken ?? (await vaultGet('slack_bot_token'));
    const signingSecret =
      (await vaultGet(`channel_signing_${node.id}`)) ?? (await vaultGet('slack_signing_secret'));

    if (!token || !signingSecret) {
      logger.warn(`Skipping node ${node.id}: no slack credentials in vault`);
      return null;
    }

    const pipeline = new IngestPipeline(
      db,
      router,
      audit,
      createLimiter(
        `slack_ingest_${node.id}`,
        SECURITY_LIMITS.ingestion.maxEventsPerHour,
        3_600_000,
      ),
    );

    return new SlackChannel({
      token,
      signingSecret,
      channelIds: [],
      ownerId: config.owner.slack?.userId,
      nodeId: node.id,
      audit,
      pipeline,
      onInbound,
    });
  }

  if (node.platform === 'discord') {
    const token = nodeToken ?? (await vaultGet('discord_bot_token'));
    if (!token) {
      logger.warn(`Skipping node ${node.id}: no discord token in vault`);
      return null;
    }

    const pipeline = new IngestPipeline(
      db,
      router,
      audit,
      createLimiter(
        `discord_ingest_${node.id}`,
        SECURITY_LIMITS.ingestion.maxEventsPerHour,
        3_600_000,
      ),
    );

    return new DiscordChannel({
      token,
      guildId: config.channels.discord.guildId,
      channelIds: [],
      ownerId: config.channels.discord.botUserId,
      nodeId: node.id,
      audit,
      pipeline,
      onInbound,
    });
  }

  if (node.platform === 'whatsapp') {
    const accessToken = nodeToken ?? (await vaultGet('whatsapp_access_token'));
    const verifyToken =
      (await vaultGet(`whatsapp_verify_token_${node.id}`)) ??
      (await vaultGet('whatsapp_verify_token'));
    const appSecret =
      (await vaultGet(`whatsapp_app_secret_${node.id}`)) ?? (await vaultGet('whatsapp_app_secret'));

    if (!accessToken || !verifyToken || !appSecret) {
      logger.warn(`Skipping node ${node.id}: incomplete whatsapp credentials`);
      return null;
    }

    const pipeline = new IngestPipeline(
      db,
      router,
      audit,
      createLimiter(`wa_ingest_${node.id}`, SECURITY_LIMITS.ingestion.maxEventsPerHour, 3_600_000),
    );

    const { WhatsAppChannel } = await import('./channels/whatsapp.js');
    return new WhatsAppChannel({
      accessToken,
      phoneNumberId: config.channels.whatsapp.phoneNumberId ?? '',
      webhookPort: config.channels.whatsapp.webhookPort ?? 9090,
      verifyToken,
      appSecret,
      audit,
      pipeline,
      onInbound,
    });
  }

  if (node.platform === 'email') {
    const password = nodeToken ?? (await vaultGet('email_password'));
    const emailConfig = config.channels.email;

    if (!password || !emailConfig.imapHost || !emailConfig.username) {
      logger.warn(`Skipping node ${node.id}: incomplete email credentials`);
      return null;
    }

    const pipeline = new IngestPipeline(
      db,
      router,
      audit,
      createLimiter(
        `email_ingest_${node.id}`,
        SECURITY_LIMITS.ingestion.maxEventsPerHour,
        3_600_000,
      ),
    );

    return new EmailChannel({
      imapHost: emailConfig.imapHost,
      imapPort: emailConfig.imapPort,
      smtpHost: emailConfig.smtpHost ?? emailConfig.imapHost,
      smtpPort: emailConfig.smtpPort,
      username: emailConfig.username,
      password,
      tls: emailConfig.tls,
      nodeId: node.id,
      audit,
      pipeline,
      onInbound,
    });
  }

  logger.info(`Platform ${node.platform} on node ${node.id} not yet supported in daemon`);
  return null;
}

// ─── Orchestrator Setup ───────────────────────────────────────────────

interface OrchestratorBundle {
  readonly registry: ChannelRegistry;
  readonly orchestrator: AgentOrchestrator;
  readonly queue: MessageQueue;
  readonly startedChannels: Array<{ nodeId: string; channel: Channel }>;
}

async function setupOrchestrator(
  graph: CanvasGraph,
  deps: {
    db: BetterSqlite3.Database;
    router: ModelRouter;
    audit: AuditLogger;
    config: OpenSauriaConfig;
  },
  checkpointManager: CheckpointManager,
  onActivity?: (event: string, data: Record<string, unknown>) => void,
): Promise<OrchestratorBundle | null> {
  const logger = getLogger();

  const connectedNodes = graph.nodes.filter(
    (n) => n.status === 'connected' && n.platform !== 'owner',
  );

  if (connectedNodes.length === 0) {
    return null;
  }

  // 1. Create modules and orchestrator (no chicken-and-egg)
  const registry = new ChannelRegistry();
  const agentMemory = new AgentMemory(deps.db);
  const kpiTracker = new KPITracker(deps.db);

  const brain = new LLMRoutingBrain(
    deps.router,
    deps.db,
    deps.config.orchestrator.routingCacheTtlMs,
  );

  const ownerIdentity = buildOwnerIdentity(deps.config);
  const orchestrator = new AgentOrchestrator({
    registry,
    graph,
    ownerIdentity,
    brain,
    db: deps.db,
    agentMemory,
    kpiTracker,
    checkpointManager,
    canvasPath: paths.canvas,
    onActivity,
  });

  const queue = new MessageQueue((msg: InboundMessage) => orchestrator.handleInbound(msg), {
    maxConcurrent: deps.config.orchestrator.maxMessagesPerSecond,
    maxQueueSize: 1000,
  });

  // 2. Create channels with onInbound wired to the queue
  const onInbound = (msg: InboundMessage): void => {
    queue.enqueue(msg);
  };

  const channelDeps = { ...deps, onInbound, globalInstructions: graph.globalInstructions };
  const startedChannels: OrchestratorBundle['startedChannels'] = [];
  const usedTokens = new Set<string>();

  for (const node of connectedNodes) {
    // Prevent duplicate polling instances for the same token (e.g. Telegram 409)
    const resolvedToken = await vaultGet(`channel_token_${node.id}`);
    if (resolvedToken) {
      if (usedTokens.has(resolvedToken)) {
        logger.warn(
          `Skipping node ${node.id}: token already in use by another node. Each bot needs a unique token.`,
        );
        continue;
      }
      usedTokens.add(resolvedToken);
    }

    const channel = await createChannelForNode(node, channelDeps);
    if (!channel) continue;

    registry.register(node.id, channel);
    startedChannels.push({ nodeId: node.id, channel });
  }

  if (startedChannels.length === 0) {
    logger.info('No channels could be created from canvas graph');
    return null;
  }

  // 3. Start all channels
  for (const { nodeId, channel } of startedChannels) {
    try {
      await channel.start();
      logger.info(`Channel started for node ${nodeId} (${channel.name})`);
    } catch (error) {
      logger.error(`Failed to start channel for node ${nodeId}`, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { registry, orchestrator, queue, startedChannels };
}

// ─── Daemon Lifecycle ─────────────────────────────────────────────────

function acquirePidLock(): void {
  const { pidFile } = paths;

  if (existsSync(pidFile)) {
    const existingPid = parseInt(readFileSync(pidFile, 'utf-8').trim(), 10);
    if (!isNaN(existingPid)) {
      try {
        // Signal 0 checks if process exists without killing it
        process.kill(existingPid, 0);
        throw new Error(
          `Another daemon is already running (PID ${existingPid}). ` +
            `Remove ${pidFile} if the process is stale.`,
        );
      } catch (error: unknown) {
        if (error instanceof Error && 'code' in error && error.code === 'ESRCH') {
          // Process doesn't exist — stale PID file, safe to overwrite
        } else {
          throw error;
        }
      }
    }
  }

  writeFileSync(pidFile, String(process.pid), 'utf-8');
}

function releasePidLock(): void {
  try {
    const { pidFile } = paths;
    if (existsSync(pidFile)) {
      const storedPid = parseInt(readFileSync(pidFile, 'utf-8').trim(), 10);
      if (storedPid === process.pid) {
        unlinkSync(pidFile);
      }
    }
  } catch {
    // Best-effort cleanup
  }
}

export async function startDaemonContext(): Promise<DaemonContext> {
  const logger = getLogger();
  logger.info('Daemon starting');

  acquirePidLock();

  await runSecurityChecks();
  logger.info('Security checks passed');

  await ensureConfigDir();
  const db = openDatabase();
  applySchema(db);
  logger.info('Database opened and schema applied');

  const config = await loadConfig();
  logger.info('Config loaded');

  const audit = new AuditLogger(db);
  const router = new ModelRouter(config, resolveApiKey);

  router.onCostIncurred((model, costUsd) => {
    recordSpend(db, costUsd, model);
    if (isOverBudget(db, config.budget.dailyLimitUsd)) {
      logger.warn('Daily budget limit reached', {
        limit: config.budget.dailyLimitUsd,
      });
    }
  });

  const mcpClients = new McpClientManager(audit);
  await connectMcpSources(config, mcpClients);

  // ─── IPC server (must start before orchestrator so broadcast is available) ─
  const ipcServer = await startIpcServer(paths.socket, db);

  // ─── Canvas-based orchestrator setup ────────────────────────────────
  const graph = loadCanvasGraph();
  const checkpointManager = new CheckpointManager(db);
  const channelDeps = { db, router, audit, config, globalInstructions: graph.globalInstructions };

  const bundle = await setupOrchestrator(
    graph,
    channelDeps,
    checkpointManager,
    ipcServer.broadcast.bind(ipcServer),
  );
  const registry: ChannelRegistry | null = bundle?.registry ?? null;
  const orchestrator: AgentOrchestrator | null = bundle?.orchestrator ?? null;
  const queue: MessageQueue | null = bundle?.queue ?? null;

  if (bundle) {
    logger.info('Orchestrator started', {
      channels: bundle.startedChannels.length,
      nodes: graph.nodes.length,
      edges: graph.edges.length,
    });
  }

  // ProactiveEngine disabled — owner drives all interaction through canvas bots
  const engine = new ProactiveEngine(db, router, () => {});
  logger.info('Proactive engine disabled (owner-driven mode)');

  const mcpServer = await startMcpServer({
    db,
    router,
    audit,
    checkpointManager,
    orchestrator: orchestrator ?? undefined,
  });
  logger.info('MCP server started on stdio');

  const refreshInterval = setInterval(() => {
    void refreshOAuthTokenIfNeeded('anthropic');
  }, 1_800_000);

  // ─── Canvas file watcher with channel lifecycle ────────────────────
  let canvasWatcher: FSWatcher | null = null;
  let canvasDebounce: ReturnType<typeof setTimeout> | null = null;
  try {
    canvasWatcher = watch(paths.canvas, { persistent: false }, () => {
      // Debounce: macOS kqueue can fire multiple times per write
      if (canvasDebounce) clearTimeout(canvasDebounce);
      canvasDebounce = setTimeout(() => {
        canvasDebounce = null;
        reloadCanvas();
      }, 100);
    });
  } catch {
    // File may not exist yet, watcher will fail gracefully
    logger.info('Canvas watcher not started (file may not exist yet)');
  }

  function reloadCanvas(): void {
    const newGraph = loadCanvasGraph();

    if (orchestrator && registry) {
      const currentNodeIds = new Set(registry.getAll().map((c) => c.nodeId));
      const newConnectedNodes = newGraph.nodes.filter(
        (n) => n.status === 'connected' && n.platform !== 'owner',
      );
      const newNodeIds = new Set(newConnectedNodes.map((n) => n.id));

      // Stop + unregister removed nodes
      for (const existingId of currentNodeIds) {
        if (!newNodeIds.has(existingId)) {
          void (async () => {
            try {
              await registry.stop(existingId);
              registry.unregister(existingId);
              logger.info('Channel removed on canvas change', { nodeId: existingId });
            } catch (error) {
              logger.warn('Error removing channel', {
                nodeId: existingId,
                error: error instanceof Error ? error.message : String(error),
              });
            }
          })();
        }
      }

      // Create + register + start new nodes
      const onInbound = (msg: InboundMessage): void => {
        if (queue) queue.enqueue(msg);
      };
      for (const node of newConnectedNodes) {
        if (!currentNodeIds.has(node.id)) {
          void (async () => {
            try {
              const channel = await createChannelForNode(node, {
                ...channelDeps,
                onInbound,
                globalInstructions: newGraph.globalInstructions,
              });
              if (channel) {
                registry.register(node.id, channel);
                await channel.start();
                logger.info('Channel added on canvas change', {
                  nodeId: node.id,
                  platform: node.platform,
                });
              }
            } catch (error) {
              logger.warn('Error adding channel', {
                nodeId: node.id,
                error: error instanceof Error ? error.message : String(error),
              });
            }
          })();
        }
      }

      orchestrator.updateGraph(newGraph);
      logger.info('Canvas graph reloaded', { nodes: newGraph.nodes.length });
    } else if (orchestrator) {
      orchestrator.updateGraph(newGraph);
      logger.info('Canvas graph reloaded (no registry)', { nodes: newGraph.nodes.length });
    }
  }

  // ─── Owner command file watcher ────────────────────────────────
  let ownerCommandWatcher: FSWatcher | null = null;
  if (orchestrator) {
    const processOwnerCommands = (): void => {
      if (!existsSync(paths.ownerCommands)) return;
      try {
        const content = readFileSync(paths.ownerCommands, 'utf-8').trim();
        if (!content) return;

        const lines = content.split('\n').filter(Boolean);
        const failedLines: string[] = [];

        for (const line of lines) {
          try {
            const parsed: unknown = JSON.parse(line);
            const result = OwnerCommandSchema.safeParse(parsed);
            if (!result.success) {
              logger.warn('Invalid owner command schema', { error: result.error.message });
              failedLines.push(line);
              continue;
            }
            const command: OwnerCommand = result.data;
            audit.logAction('owner:command_received', { type: command.type });
            void orchestrator.handleOwnerCommand(command);
          } catch {
            logger.warn('Invalid owner command JSON', { line });
            failedLines.push(line);
          }
        }

        writeFileSync(
          paths.ownerCommands,
          failedLines.length > 0 ? failedLines.join('\n') + '\n' : '',
          'utf-8',
        );
      } catch (error) {
        logger.warn('Error reading owner commands', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    };

    try {
      // Create the file if it doesn't exist
      if (!existsSync(paths.ownerCommands)) {
        writeFileSync(paths.ownerCommands, '', 'utf-8');
      }

      ownerCommandWatcher = watch(paths.ownerCommands, { persistent: false }, () => {
        processOwnerCommands();
      });
      logger.info('Owner command watcher started');
    } catch {
      logger.info('Owner command watcher not started');
    }
  }

  audit.logAction('daemon:start', {
    mcpServers: Object.keys(config.mcp.servers),
    orchestratorActive: bundle !== null,
    orchestratorChannels: bundle?.startedChannels.length ?? 0,
  });

  return {
    db,
    config,
    audit,
    router,
    mcpClients,
    engine,
    mcpServer,
    refreshInterval,
    ipcServer,
    registry,
    orchestrator,
    queue,
    canvasWatcher,
    ownerCommandWatcher,
  };
}

export async function stopDaemonContext(ctx: DaemonContext): Promise<void> {
  const logger = getLogger();
  logger.info('Daemon shutting down');

  clearInterval(ctx.refreshInterval);

  if (ctx.ownerCommandWatcher) {
    ctx.ownerCommandWatcher.close();
    logger.info('Owner command watcher stopped');
  }

  if (ctx.canvasWatcher) {
    ctx.canvasWatcher.close();
    logger.info('Canvas watcher stopped');
  }

  if (ctx.queue) {
    ctx.queue.stop();
    logger.info('Message queue stopped');
  }

  if (ctx.registry) {
    await ctx.registry.stopAll();
    logger.info('All orchestrator channels stopped');
  }

  ctx.engine.stop();
  logger.info('Proactive engine stopped');

  await ctx.mcpClients.disconnectAll();
  logger.info('MCP clients disconnected');

  await ctx.ipcServer.close();

  ctx.audit.logAction('daemon:stop', {});
  closeDatabase(ctx.db);
  logger.info('Database closed');

  releasePidLock();
  logger.info('Daemon stopped');
}
