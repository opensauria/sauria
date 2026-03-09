import { invoke } from '@tauri-apps/api/core';

type ListResult = { rows: Array<Record<string, unknown>>; total: number };

export function brainGetStats(): Promise<Record<string, number>> {
  return invoke('brain_get_stats');
}

export function brainListEntities(opts: Record<string, unknown>): Promise<ListResult> {
  return invoke('brain_list_entities', { opts });
}

export function brainListRelations(opts: Record<string, unknown>): Promise<ListResult> {
  return invoke('brain_list_relations', { opts });
}

export function brainListEvents(opts: Record<string, unknown>): Promise<ListResult> {
  return invoke('brain_list_events', { opts });
}

export function brainListObservations(opts: Record<string, unknown>): Promise<ListResult> {
  return invoke('brain_list_observations', { opts });
}

export function brainListConversations(opts: Record<string, unknown>): Promise<ListResult> {
  return invoke('brain_list_conversations', { opts });
}

export function brainListFacts(opts: Record<string, unknown>): Promise<ListResult> {
  return invoke('brain_list_facts', { opts });
}

export function brainGetEntity(id: string): Promise<{
  entity: Record<string, unknown>;
  relations: Array<Record<string, unknown>>;
  events: Array<Record<string, unknown>>;
} | null> {
  return invoke('brain_get_entity', { id });
}

export function brainGetConversation(
  id: string,
  opts: Record<string, unknown>,
): Promise<{ rows: Array<Record<string, unknown>> }> {
  return invoke('brain_get_conversation', { id, opts });
}

export function brainUpdateEntity(id: string, fields: Record<string, unknown>): Promise<void> {
  return invoke('brain_update_entity', { id, fields });
}

export function brainDelete(table: string, id: string): Promise<void> {
  return invoke('brain_delete', { table, id });
}
