import type {
  IntegrationDefinition,
  IntegrationInstance,
  IntegrationStatus,
  IntegrationTool,
} from '@sauria/types';
import { join, dirname } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import type { McpClientManager } from '../mcp/client.js';
import type { AuditLogger } from '../security/audit.js';
import { sanitizeToolMetadata } from '../security/sanitize.js';
import { getLogger } from '../utils/logger.js';

function resolveNpxPath(): string {
  const nodeDir = dirname(process.execPath);
  const npxInNodeDir = join(nodeDir, 'npx');
  if (existsSync(npxInNodeDir)) return npxInNodeDir;
  return 'npx';
}

function resolveMcpWorkdir(instanceId: string): string {
  const dir = join(homedir(), '.sauria', 'mcp-workdirs', instanceId);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export interface IntegrationInstanceStatus {
  readonly instanceId: string;
  readonly integrationId: string;
  readonly label: string;
  readonly connected: boolean;
  readonly tools: readonly IntegrationTool[];
  readonly error?: string;
}

interface ConnectedInstance {
  readonly instanceId: string;
  readonly integrationId: string;
  readonly label: string;
  readonly tools: readonly IntegrationTool[];
  readonly connectedAt: string;
}

export class IntegrationRegistry {
  private readonly instances = new Map<string, ConnectedInstance>();

  constructor(
    private readonly mcpClients: McpClientManager,
    private readonly audit: AuditLogger,
    private readonly catalog: readonly IntegrationDefinition[],
  ) {}

  // ─── Legacy API (backward compat) ──────────────────────────────────

  async connect(id: string, credentials: Record<string, string>): Promise<IntegrationStatus> {
    const instanceId = `${id}:default`;
    const definition = this.catalog.find((d) => d.id === id);
    if (!definition) {
      throw new Error(`Unknown integration: ${id}`);
    }

    const result = await this.connectInstance(instanceId, id, definition.name, credentials);

    return {
      id,
      definition,
      connected: result.connected,
      tools: result.tools,
      error: result.error,
    };
  }

  async disconnect(id: string): Promise<void> {
    const instanceId = `${id}:default`;
    if (this.instances.has(instanceId)) {
      await this.disconnectInstance(instanceId);
      return;
    }
    // Fallback: try direct instanceId (may already be an instance key)
    if (this.instances.has(id)) {
      await this.disconnectInstance(id);
    }
  }

  async disconnectAll(): Promise<void> {
    const ids = [...this.instances.keys()];
    for (const id of ids) {
      await this.disconnectInstance(id);
    }
  }

  getCatalogWithStatus(): IntegrationStatus[] {
    return this.catalog.map((definition) => {
      const entry = this.findDefaultInstance(definition.id);
      return {
        id: definition.id,
        definition,
        connected: !!entry,
        tools: entry?.tools ?? [],
      };
    });
  }

  getAvailableTools(integrationId?: string): IntegrationTool[] {
    if (integrationId) {
      const byInstance = this.instances.get(integrationId);
      if (byInstance) return [...byInstance.tools];

      const byDefault = this.findDefaultInstance(integrationId);
      return byDefault ? [...byDefault.tools] : [];
    }
    const tools: IntegrationTool[] = [];
    for (const entry of this.instances.values()) {
      tools.push(...entry.tools);
    }
    return tools;
  }

  async callTool(
    integrationId: string,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    // Try as instanceId first, then as legacy integrationId
    const instanceId = this.instances.has(integrationId)
      ? integrationId
      : `${integrationId}:default`;

    if (!this.instances.has(instanceId)) {
      throw new Error(`Integration not connected: ${integrationId}`);
    }

    // Strip "IntegrationName/" prefix if LLM included it
    const slashIdx = toolName.indexOf('/');
    const resolvedTool = slashIdx > 0 ? toolName.slice(slashIdx + 1) : toolName;

    const serverName = `integration:${instanceId}`;
    return this.mcpClients.callTool(serverName, resolvedTool, args);
  }

  getConnectedIds(): string[] {
    return [...this.instances.keys()];
  }

  // ─── Instance API (new) ────────────────────────────────────────────

  async connectInstance(
    instanceId: string,
    integrationId: string,
    label: string,
    credentials: Record<string, string>,
  ): Promise<IntegrationInstanceStatus> {
    const logger = getLogger();
    const definition = this.catalog.find((d) => d.id === integrationId);
    if (!definition) {
      throw new Error(`Unknown integration: ${integrationId}`);
    }

    const serverName = `integration:${instanceId}`;
    const { accessToken } = credentials;

    try {
      if (definition.mcpRemote && accessToken) {
        // Remote MCP path — connect via HTTP/SSE with OAuth token
        await this.mcpClients.connectRemote({
          name: serverName,
          url: definition.mcpRemote.url,
          accessToken,
        });
      } else {
        // Local MCP path — spawn via npx
        const env: Record<string, string> = {};

        // OAuth proxy path: inject access token via envMapping
        if (accessToken && definition.oauthProxy) {
          const envVar = definition.mcpServer.envMapping['accessToken'];
          if (envVar) env[envVar] = accessToken;
        }

        // Standard credential keys
        for (const key of definition.credentialKeys) {
          const envVar = definition.mcpServer.envMapping[key];
          const value = credentials[key];
          if (!envVar || !value) {
            throw new Error(`Missing credential: ${key}`);
          }
          const template = definition.mcpServer.envValueTemplate?.[key];
          env[envVar] = template ? template.replace('{value}', value) : value;
        }

        const npxPath = resolveNpxPath();
        await this.mcpClients.connect({
          name: serverName,
          command: npxPath,
          args: ['-y', definition.mcpServer.package],
          env: { ...process.env, ...env } as Record<string, string>,
          cwd: resolveMcpWorkdir(instanceId),
        });
      }

      const rawTools = await this.mcpClients.listTools(serverName);
      const tools: IntegrationTool[] = rawTools.map((t) => {
        const safe = sanitizeToolMetadata(t.name, t.description);
        return {
          instanceId,
          integrationId,
          integrationName: definition.name,
          name: safe.name,
          description: safe.description,
        };
      });

      this.instances.set(instanceId, {
        instanceId,
        integrationId,
        label,
        tools,
        connectedAt: new Date().toISOString(),
      });

      this.audit.logAction('integration:connect', {
        instanceId,
        integrationId,
        label,
        toolCount: tools.length,
        remote: !!definition.mcpRemote && !!accessToken,
      });

      logger.info(`Integration instance connected: ${label} (${tools.length} tools)`);

      return { instanceId, integrationId, label, connected: true, tools };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error(`Failed to connect integration instance: ${label}`, { error: errorMsg });
      this.audit.logAction(
        'integration:connect',
        { instanceId, integrationId, error: errorMsg },
        { success: false },
      );

      return { instanceId, integrationId, label, connected: false, tools: [], error: errorMsg };
    }
  }

  async refreshRemoteConnection(instanceId: string, newAccessToken: string): Promise<void> {
    const logger = getLogger();
    const instance = this.instances.get(instanceId);
    if (!instance) return;

    const definition = this.catalog.find((d) => d.id === instance.integrationId);
    if (!definition?.mcpRemote) return;

    const serverName = `integration:${instanceId}`;

    try {
      await this.mcpClients.disconnect(serverName);
    } catch {
      // May already be disconnected
    }

    await this.mcpClients.connectRemote({
      name: serverName,
      url: definition.mcpRemote.url,
      accessToken: newAccessToken,
    });

    logger.info(`Refreshed remote connection: ${instanceId}`);
  }

  async disconnectInstance(instanceId: string): Promise<void> {
    const logger = getLogger();
    const serverName = `integration:${instanceId}`;

    try {
      await this.mcpClients.disconnect(serverName);
    } catch {
      // Server may already be disconnected
    }

    this.instances.delete(instanceId);
    this.audit.logAction('integration:disconnect', { instanceId });
    logger.info(`Integration instance disconnected: ${instanceId}`);
  }

  getToolsForInstances(instanceIds: readonly string[]): IntegrationTool[] {
    const tools: IntegrationTool[] = [];
    for (const id of instanceIds) {
      const instance = this.instances.get(id);
      if (instance) {
        tools.push(...instance.tools);
      }
    }
    return tools;
  }

  async callToolForInstance(
    instanceId: string,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    if (!this.instances.has(instanceId)) {
      throw new Error(`Instance not connected: ${instanceId}`);
    }

    const serverName = `integration:${instanceId}`;
    return this.mcpClients.callTool(serverName, toolName, args);
  }

  getInstanceList(): IntegrationInstance[] {
    return [...this.instances.values()].map((i) => ({
      id: i.instanceId,
      integrationId: i.integrationId,
      label: i.label,
      connectedAt: i.connectedAt,
    }));
  }

  private findDefaultInstance(integrationId: string): ConnectedInstance | undefined {
    return this.instances.get(`${integrationId}:default`);
  }
}
