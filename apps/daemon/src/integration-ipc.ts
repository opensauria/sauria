import type { IntegrationInstance } from '@sauria/types';
import type { DaemonIpcServer } from './daemon-ipc.js';
import type { IntegrationRegistry } from './integrations/registry.js';
import type { AgentOrchestrator } from './orchestrator/orchestrator.js';
import type { CanvasGraph } from './orchestrator/types.js';
import type { SauriaConfig } from './config/schema.js';
import { INTEGRATION_CATALOG } from './integrations/catalog.js';
import { vaultStore, vaultDelete } from './security/vault-key.js';
import { persistCanvasGraphDebounced } from './graph-loader.js';
import { paths } from './config/paths.js';

export interface IntegrationIpcDeps {
  readonly ipcServer: DaemonIpcServer;
  readonly integrationRegistry: IntegrationRegistry;
  readonly getOrchestrator: () => AgentOrchestrator | null;
  readonly loadCanvasGraph: () => CanvasGraph;
  readonly loadConfig: () => Promise<SauriaConfig>;
  readonly saveConfig: (config: SauriaConfig) => Promise<void>;
}

function writeCanvasGraph(graph: CanvasGraph): void {
  persistCanvasGraphDebounced(paths.canvas, graph);
}

export function registerIntegrationHandlers(deps: IntegrationIpcDeps): void {
  const {
    ipcServer,
    integrationRegistry,
    getOrchestrator,
    loadCanvasGraph,
    loadConfig,
    saveConfig,
  } = deps;

  ipcServer.registerMethod('integrations:list-catalog', () =>
    integrationRegistry.getCatalogWithStatus(),
  );

  ipcServer.registerMethod('integrations:connect', async (_db, params) => {
    const id = params['id'] as string;
    const credentials = params['credentials'] as Record<string, string>;
    const def = INTEGRATION_CATALOG.find((d) => d.id === id);
    if (!def) throw new Error(`Unknown integration: ${id}`);

    const result = await integrationRegistry.connect(id, credentials);

    for (const key of def.credentialKeys) {
      const value = credentials[key];
      if (value) await vaultStore(`integration_${id}_${key}`, value);
    }

    const currentConfig = await loadConfig();
    const updatedConfig = {
      ...currentConfig,
      integrations: { ...currentConfig.integrations, [id]: { enabled: true } },
    };
    await saveConfig(updatedConfig);

    const currentGraph = loadCanvasGraph();
    const instanceId = `${id}:default`;
    const alreadyExists = (currentGraph.instances ?? []).some((i) => i.id === instanceId);
    if (!alreadyExists) {
      const instance: IntegrationInstance = {
        id: instanceId,
        integrationId: id,
        label: def.name,
        connectedAt: new Date().toISOString(),
      };
      const updatedGraph = {
        ...currentGraph,
        instances: [...(currentGraph.instances ?? []), instance],
      };
      writeCanvasGraph(updatedGraph);
      const orchestrator = getOrchestrator();
      if (orchestrator) orchestrator.updateGraph(updatedGraph);
    }

    return result;
  });

  ipcServer.registerMethod('integrations:disconnect', async (_db, params) => {
    const id = params['id'] as string;
    await integrationRegistry.disconnect(id);

    const def = INTEGRATION_CATALOG.find((d) => d.id === id);
    if (def) {
      for (const key of def.credentialKeys) {
        await vaultDelete(`integration_${id}_${key}`);
      }
    }

    const currentConfig = await loadConfig();
    const updatedConfig = {
      ...currentConfig,
      integrations: { ...currentConfig.integrations, [id]: { enabled: false } },
    };
    await saveConfig(updatedConfig);

    const instanceId = `${id}:default`;
    const currentGraph = loadCanvasGraph();
    const updatedInstances = (currentGraph.instances ?? []).filter((i) => i.id !== instanceId);
    const updatedNodes = currentGraph.nodes.map((n) => {
      if (!n.integrations) return n;
      const filtered = n.integrations.filter((iid) => iid !== instanceId);
      return filtered.length === n.integrations.length ? n : { ...n, integrations: filtered };
    });
    const updatedGraph = { ...currentGraph, instances: updatedInstances, nodes: updatedNodes };
    writeCanvasGraph(updatedGraph);
    const orchestrator = getOrchestrator();
    if (orchestrator) orchestrator.updateGraph(updatedGraph);

    return { success: true };
  });

  ipcServer.registerMethod('integrations:list-tools', (_db, params) => {
    const integrationId = params['integrationId'] as string | undefined;
    return integrationRegistry.getAvailableTools(integrationId);
  });

  ipcServer.registerMethod('integrations:assign-instance', (_db, params) => {
    const nodeId = params['nodeId'] as string;
    const instanceId = params['instanceId'] as string;
    const currentGraph = loadCanvasGraph();
    const node = currentGraph.nodes.find((n) => n.id === nodeId);
    if (!node) throw new Error(`Node not found: ${nodeId}`);

    const existing = node.integrations ?? [];
    if (existing.includes(instanceId)) return { success: true };

    const updatedNodes = currentGraph.nodes.map((n) =>
      n.id === nodeId ? { ...n, integrations: [...existing, instanceId] } : n,
    );
    const updatedGraph = { ...currentGraph, nodes: updatedNodes };
    writeCanvasGraph(updatedGraph);

    const orchestrator = getOrchestrator();
    if (orchestrator) orchestrator.updateGraph(updatedGraph);
    return { success: true };
  });

  ipcServer.registerMethod('integrations:unassign-instance', (_db, params) => {
    const nodeId = params['nodeId'] as string;
    const instanceId = params['instanceId'] as string;
    const currentGraph = loadCanvasGraph();
    const node = currentGraph.nodes.find((n) => n.id === nodeId);
    if (!node) throw new Error(`Node not found: ${nodeId}`);

    const existing = node.integrations ?? [];
    const updatedNodes = currentGraph.nodes.map((n) =>
      n.id === nodeId ? { ...n, integrations: existing.filter((id) => id !== instanceId) } : n,
    );
    const updatedGraph = { ...currentGraph, nodes: updatedNodes };
    writeCanvasGraph(updatedGraph);

    const orchestrator = getOrchestrator();
    if (orchestrator) orchestrator.updateGraph(updatedGraph);
    return { success: true };
  });

  ipcServer.registerMethod('integrations:connect-instance', async (_db, params) => {
    const instanceId = params['instanceId'] as string;
    const integrationId = params['integrationId'] as string;
    const label = params['label'] as string;
    const credentials = params['credentials'] as Record<string, string>;
    return integrationRegistry.connectInstance(instanceId, integrationId, label, credentials);
  });

  ipcServer.registerMethod('integrations:disconnect-instance', async (_db, params) => {
    const instanceId = params['instanceId'] as string;
    await integrationRegistry.disconnectInstance(instanceId);
    return { success: true };
  });
}
