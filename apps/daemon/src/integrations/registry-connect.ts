import { join, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import type { IntegrationDefinition, IntegrationTool } from '@sauria/types';
import type { McpClientManager } from '../mcp/client.js';
import type { AuditLogger } from '../security/audit.js';
import { getLogger } from '../utils/logger.js';
import type { IntegrationInstanceStatus, ConnectedInstance } from './registry.js';

function resolveNpxPath(): string {
  const nodeDir = dirname(process.execPath);
  const npxInNodeDir = join(nodeDir, 'npx');
  if (existsSync(npxInNodeDir)) return npxInNodeDir;
  return 'npx';
}

export async function connectIntegrationInstance(
  instanceId: string,
  integrationId: string,
  label: string,
  credentials: Record<string, string>,
  definition: IntegrationDefinition,
  mcpClients: McpClientManager,
  audit: AuditLogger,
  instances: Map<string, ConnectedInstance>,
  _options?: { remote?: boolean; workdir?: string },
): Promise<IntegrationInstanceStatus> {
  const logger = getLogger();
  const serverName = `integration:${instanceId}`;
  const env: Record<string, string> = {};

  for (const key of definition.credentialKeys) {
    const envVar = definition.mcpServer.envMapping[key];
    const value = credentials[key];
    if (!envVar || !value) {
      throw new Error(`Missing credential: ${key}`);
    }
    const template = definition.mcpServer.envValueTemplate?.[key];
    env[envVar] = template ? template.replace('{value}', value) : value;
  }

  try {
    const npxPath = resolveNpxPath();
    await mcpClients.connect({
      name: serverName,
      command: npxPath,
      args: ['-y', definition.mcpServer.package],
      env: { ...process.env, ...env } as Record<string, string>,
    });

    const rawTools = await mcpClients.listTools(serverName);
    const tools: IntegrationTool[] = rawTools.map((t) => ({
      instanceId,
      integrationId,
      integrationName: definition.name,
      name: t.name,
      description: t.description,
    }));

    instances.set(instanceId, {
      instanceId,
      integrationId,
      label,
      tools,
      connectedAt: new Date().toISOString(),
    });

    audit.logAction('integration:connect', {
      instanceId,
      integrationId,
      label,
      toolCount: tools.length,
    });

    logger.info(`Integration instance connected: ${label} (${tools.length} tools)`);

    return { instanceId, integrationId, label, connected: true, tools };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error(`Failed to connect integration instance: ${label}`, { error: errorMsg });
    audit.logAction(
      'integration:connect',
      { instanceId, integrationId, error: errorMsg },
      { success: false },
    );

    return { instanceId, integrationId, label, connected: false, tools: [], error: errorMsg };
  }
}

export async function disconnectIntegrationInstance(
  instanceId: string,
  mcpClients: McpClientManager,
  audit: AuditLogger,
  instances: Map<string, ConnectedInstance>,
): Promise<void> {
  const logger = getLogger();
  const serverName = `integration:${instanceId}`;

  try {
    await mcpClients.disconnect(serverName);
  } catch {
    // Server may already be disconnected
  }

  instances.delete(instanceId);
  audit.logAction('integration:disconnect', { instanceId });
  logger.info(`Integration instance disconnected: ${instanceId}`);
}
