import { invoke } from '@tauri-apps/api/core';
import type { CanvasGraph, IntegrationDef, OwnerProfile } from './types.js';

export { connectChannel, disconnectChannel, navigateBack } from '../shared/ipc.js';
export type { ConnectResult } from '../shared/types.js';

export function getCanvasGraph(): Promise<CanvasGraph> {
  return invoke<CanvasGraph>('get_canvas_graph');
}

export function saveCanvasGraph(graph: CanvasGraph): Promise<void> {
  return invoke('save_canvas_graph', { graph });
}

export function getOwnerProfile(): Promise<OwnerProfile> {
  return invoke<OwnerProfile>('get_owner_profile');
}

export function getAgentKpis(nodeId: string): Promise<{
  messagesHandled: number;
  tasksCompleted: number;
  avgResponseTimeMs: number;
  costUsd: number;
}> {
  return invoke('get_agent_kpis', { nodeId });
}

export function saveAgentDetail(nodeId: string, patch: Record<string, unknown>): Promise<void> {
  return invoke('save_agent_detail', { nodeId, patch });
}

export function listIntegrationCatalog(): Promise<
  Array<{ id: string; definition: IntegrationDef }>
> {
  return invoke('integrations_list_catalog');
}

export function assignIntegration(nodeId: string, instanceId: string): Promise<void> {
  return invoke('integrations_assign_instance', { nodeId, instanceId });
}

export function unassignIntegration(nodeId: string, instanceId: string): Promise<void> {
  return invoke('integrations_unassign_instance', { nodeId, instanceId });
}

export function listConversations(
  opts: Record<string, unknown>,
): Promise<{ rows: Array<Record<string, unknown>>; total: number }> {
  return invoke('brain_list_conversations', { opts });
}

export function getConversation(
  id: string,
  opts: Record<string, unknown>,
): Promise<{ rows: Array<Record<string, unknown>> }> {
  return invoke('brain_get_conversation', { id, opts });
}
