import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import type {
  IntegrationDefinition,
  IntegrationInstance,
  IntegrationStatus,
  IntegrationTool,
} from '@sauria/types';
import type { McpClientManager } from '../mcp/client.js';
import type { AuditLogger } from '../security/audit.js';
import { connectIntegrationInstance, disconnectIntegrationInstance } from './registry-connect.js';
import { getLogger } from '../utils/logger.js';

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

export interface ConnectedInstance {
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
    const instanceId = this.instances.has(integrationId)
      ? integrationId
      : `${integrationId}:default`;

    if (!this.instances.has(instanceId)) {
      throw new Error(`Integration not connected: ${integrationId}`);
    }

    const slashIdx = toolName.indexOf('/');
    const resolvedTool = slashIdx > 0 ? toolName.slice(slashIdx + 1) : toolName;

    const serverName = `integration:${instanceId}`;
    return this.mcpClients.callTool(serverName, resolvedTool, args);
  }

  getConnectedIds(): string[] {
    return [...this.instances.keys()];
  }

  getInstancesForIntegration(integrationId: string): ConnectedInstance[] {
    return [...this.instances.values()].filter((i) => i.integrationId === integrationId);
  }

  async connectInstance(
    instanceId: string,
    integrationId: string,
    label: string,
    credentials: Record<string, string>,
  ): Promise<IntegrationInstanceStatus> {
    const definition = this.catalog.find((d) => d.id === integrationId);
    if (!definition) {
      throw new Error(`Unknown integration: ${integrationId}`);
    }

    const { accessToken } = credentials;

    // Remote MCP path — connect via HTTP/SSE with OAuth token
    if (definition.mcpRemote && accessToken) {
      return connectIntegrationInstance(
        instanceId,
        integrationId,
        label,
        credentials,
        definition,
        this.mcpClients,
        this.audit,
        this.instances,
        { remote: true, workdir: resolveMcpWorkdir(instanceId) },
      );
    }

    // Local MCP path — spawn via npx
    return connectIntegrationInstance(
      instanceId,
      integrationId,
      label,
      credentials,
      definition,
      this.mcpClients,
      this.audit,
      this.instances,
      { remote: false, workdir: resolveMcpWorkdir(instanceId) },
    );
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
    return disconnectIntegrationInstance(instanceId, this.mcpClients, this.audit, this.instances);
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
