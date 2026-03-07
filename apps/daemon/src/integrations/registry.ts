import type {
  IntegrationDefinition,
  IntegrationInstance,
  IntegrationStatus,
  IntegrationTool,
} from '@sauria/types';
import type { McpClientManager } from '../mcp/client.js';
import type { AuditLogger } from '../security/audit.js';
import {
  connectIntegrationInstance,
  disconnectIntegrationInstance,
} from './registry-connect.js';

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
    return connectIntegrationInstance(
      instanceId, integrationId, label, credentials,
      definition, this.mcpClients, this.audit, this.instances,
    );
  }

  async disconnectInstance(instanceId: string): Promise<void> {
    return disconnectIntegrationInstance(
      instanceId, this.mcpClients, this.audit, this.instances,
    );
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
