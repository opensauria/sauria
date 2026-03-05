import type { IntegrationDefinition, IntegrationStatus, IntegrationTool } from '@opensauria/types';
import type { McpClientManager } from '../mcp/client.js';
import type { AuditLogger } from '../security/audit.js';
import { getLogger } from '../utils/logger.js';

interface ConnectedIntegration {
  readonly tools: readonly IntegrationTool[];
  readonly connectedAt: string;
}

export class IntegrationRegistry {
  private readonly connected = new Map<string, ConnectedIntegration>();

  constructor(
    private readonly mcpClients: McpClientManager,
    private readonly audit: AuditLogger,
    private readonly catalog: readonly IntegrationDefinition[],
  ) {}

  async connect(id: string, credentials: Record<string, string>): Promise<IntegrationStatus> {
    const logger = getLogger();
    const definition = this.catalog.find((d) => d.id === id);
    if (!definition) {
      throw new Error(`Unknown integration: ${id}`);
    }

    const serverName = `integration:${id}`;
    const env: Record<string, string> = {};
    for (const key of definition.credentialKeys) {
      const envVar = definition.mcpServer.envMapping[key];
      const value = credentials[key];
      if (!envVar || !value) {
        throw new Error(`Missing credential: ${key}`);
      }
      env[envVar] = value;
    }

    try {
      await this.mcpClients.connect({
        name: serverName,
        command: 'npx',
        args: ['-y', definition.mcpServer.package],
        env: { ...process.env, ...env } as Record<string, string>,
      });

      const rawTools = await this.mcpClients.listTools(serverName);
      const tools: IntegrationTool[] = rawTools.map((t) => ({
        integrationId: id,
        integrationName: definition.name,
        name: t.name,
        description: t.description,
      }));

      this.connected.set(id, {
        tools,
        connectedAt: new Date().toISOString(),
      });

      this.audit.logAction('integration:connect', {
        id,
        name: definition.name,
        toolCount: tools.length,
      });

      logger.info(`Integration connected: ${definition.name} (${tools.length} tools)`);

      return {
        id,
        definition,
        connected: true,
        tools,
      };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error(`Failed to connect integration: ${definition.name}`, { error: errorMsg });
      this.audit.logAction('integration:connect', { id, error: errorMsg }, { success: false });

      return {
        id,
        definition,
        connected: false,
        tools: [],
        error: errorMsg,
      };
    }
  }

  async disconnect(id: string): Promise<void> {
    const logger = getLogger();
    const serverName = `integration:${id}`;

    try {
      await this.mcpClients.disconnect(serverName);
    } catch {
      // Server may already be disconnected
    }

    this.connected.delete(id);
    this.audit.logAction('integration:disconnect', { id });
    logger.info(`Integration disconnected: ${id}`);
  }

  async disconnectAll(): Promise<void> {
    const ids = [...this.connected.keys()];
    for (const id of ids) {
      await this.disconnect(id);
    }
  }

  getCatalogWithStatus(): IntegrationStatus[] {
    return this.catalog.map((definition) => {
      const entry = this.connected.get(definition.id);
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
      return [...(this.connected.get(integrationId)?.tools ?? [])];
    }
    const tools: IntegrationTool[] = [];
    for (const entry of this.connected.values()) {
      tools.push(...entry.tools);
    }
    return tools;
  }

  async callTool(
    integrationId: string,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    if (!this.connected.has(integrationId)) {
      throw new Error(`Integration not connected: ${integrationId}`);
    }

    const serverName = `integration:${integrationId}`;
    return this.mcpClients.callTool(serverName, toolName, args);
  }

  getConnectedIds(): string[] {
    return [...this.connected.keys()];
  }
}
