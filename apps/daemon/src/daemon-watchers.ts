import { readFileSync, writeFileSync, existsSync, watch, type FSWatcher } from 'node:fs';
import type BetterSqlite3 from 'better-sqlite3';
import type { AuditLogger } from './security/audit.js';
import type { ModelRouter } from './ai/router.js';
import type { SauriaConfig } from './config/schema.js';
import type { ChannelRegistry } from './channels/registry.js';
import type { AgentOrchestrator } from './orchestrator/orchestrator.js';
import type { MessageQueue } from './orchestrator/message-queue.js';
import type { CanvasGraph, InboundMessage, OwnerCommand } from './orchestrator/types.js';
import type { IntegrationRegistry } from './integrations/registry.js';
import type { McpClientManager } from './mcp/client.js';
import type { OrchestratorBundle } from './orchestrator-setup.js';
import { OwnerCommandSchema } from './orchestrator/types.js';
import { connectPersonalMcpSources } from './orchestrator-setup.js';
import { getLogger } from './utils/logger.js';
import { paths } from './config/paths.js';
import { loadCanvasGraph } from './graph-loader.js';
import { createChannelForNode } from './channel-factory.js';

export interface CanvasWatcherDeps {
  readonly orchestrator: AgentOrchestrator | null;
  readonly registry: ChannelRegistry | null;
  readonly queue: MessageQueue | null;
  readonly db: BetterSqlite3.Database;
  readonly router: ModelRouter;
  readonly audit: AuditLogger;
  readonly config: SauriaConfig;
  readonly globalInstructions: string;
  readonly mcpClients?: McpClientManager;
  readonly integrationRegistry?: IntegrationRegistry;
  readonly setupOrchestrator?: (graph: CanvasGraph) => Promise<OrchestratorBundle | null>;
}

export function setupCanvasWatcher(deps: CanvasWatcherDeps): FSWatcher | null {
  const { mcpClients, integrationRegistry } = deps;
  let currentOrchestrator = deps.orchestrator;
  let currentRegistry = deps.registry;
  let currentQueue = deps.queue;
  const logger = getLogger();
  let canvasDebounce: ReturnType<typeof setTimeout> | null = null;
  const connectedPersonalMcpIds = new Set<string>();

  // Seed with already-connected personal MCPs
  const initialGraph = loadCanvasGraph();
  for (const entry of initialGraph.personalMcp ?? []) {
    connectedPersonalMcpIds.add(entry.id);
  }
  const channelDeps = {
    db: deps.db,
    router: deps.router,
    audit: deps.audit,
    config: deps.config,
    globalInstructions: deps.globalInstructions,
  };

  let orchestratorInitInFlight = false;

  const reloadCanvas = (): void => {
    const newGraph = loadCanvasGraph();

    // Lazy orchestrator init: if null but canvas now has connected nodes, create it
    if (!currentOrchestrator && !orchestratorInitInFlight && deps.setupOrchestrator) {
      const hasConnected = newGraph.nodes.some(
        (n) => n.status === 'connected' && n.platform !== 'owner',
      );
      if (hasConnected) {
        orchestratorInitInFlight = true;
        void (async () => {
          try {
            const bundle = await deps.setupOrchestrator!(newGraph);
            if (bundle) {
              currentOrchestrator = bundle.orchestrator;
              currentRegistry = bundle.registry;
              currentQueue = bundle.queue;
              logger.info('Orchestrator initialized on canvas change', {
                channels: bundle.startedChannels.length,
              });
            }
          } catch (error) {
            logger.error('Failed to initialize orchestrator on canvas change', {
              error: error instanceof Error ? error.message : String(error),
            });
          } finally {
            orchestratorInitInFlight = false;
          }
        })();
      }
      return;
    }

    if (currentOrchestrator && currentRegistry) {
      const currentNodeIds = new Set(currentRegistry.getAll().map((c) => c.nodeId));
      const newConnectedNodes = newGraph.nodes.filter(
        (n) => n.status === 'connected' && n.platform !== 'owner',
      );
      const newNodeIds = new Set(newConnectedNodes.map((n) => n.id));

      for (const existingId of currentNodeIds) {
        if (!newNodeIds.has(existingId)) {
          void (async () => {
            try {
              await currentRegistry!.stop(existingId);
              currentRegistry!.unregister(existingId);
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

      const onInbound = (msg: InboundMessage): void => {
        if (currentQueue) currentQueue.enqueue(msg);
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
                currentRegistry!.register(node.id, channel);
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

      currentOrchestrator.updateGraph(newGraph);
      logger.info('Canvas graph reloaded', { nodes: newGraph.nodes.length });
    } else if (currentOrchestrator) {
      currentOrchestrator.updateGraph(newGraph);
      logger.info('Canvas graph reloaded (no registry)', { nodes: newGraph.nodes.length });
    }

    // Hot-connect new personal MCP sources added via the UI
    if (mcpClients && integrationRegistry) {
      const newEntries = (newGraph.personalMcp ?? []).filter(
        (e) => !connectedPersonalMcpIds.has(e.id),
      );
      if (newEntries.length > 0) {
        const subset = { ...newGraph, personalMcp: newEntries };
        void connectPersonalMcpSources(subset, mcpClients, integrationRegistry).then(() => {
          for (const entry of newEntries) {
            connectedPersonalMcpIds.add(entry.id);
          }
        });
      }
    }
  };

  try {
    return watch(paths.canvas, { persistent: false }, () => {
      if (canvasDebounce) clearTimeout(canvasDebounce);
      canvasDebounce = setTimeout(() => {
        canvasDebounce = null;
        reloadCanvas();
      }, 100);
    });
  } catch {
    logger.info('Canvas watcher not started (file may not exist yet)');
    return null;
  }
}

export function setupOwnerCommandWatcher(
  orchestrator: AgentOrchestrator | null,
  audit: AuditLogger,
): FSWatcher | null {
  if (!orchestrator) return null;
  const logger = getLogger();

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
    if (!existsSync(paths.ownerCommands)) {
      writeFileSync(paths.ownerCommands, '', 'utf-8');
    }

    const watcher = watch(paths.ownerCommands, { persistent: false }, () => {
      processOwnerCommands();
    });
    logger.info('Owner command watcher started');
    return watcher;
  } catch {
    logger.info('Owner command watcher not started');
    return null;
  }
}
