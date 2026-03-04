/**
 * Typed IPC method constants — single source of truth for daemon <-> desktop.
 *
 * All method names are typed string literals. The MethodMap provides
 * compile-time verification that both sides use the same method names.
 */

export const IPC_METHODS = {
  LIST_ENTITIES: 'brain:list-entities',
  GET_ENTITY: 'brain:get-entity',
  LIST_RELATIONS: 'brain:list-relations',
  LIST_OBSERVATIONS: 'brain:list-observations',
  LIST_EVENTS: 'brain:list-events',
  LIST_CONVERSATIONS: 'brain:list-conversations',
  GET_CONVERSATION: 'brain:get-conversation',
  LIST_FACTS: 'brain:list-facts',
  GET_STATS: 'brain:get-stats',
  DELETE: 'brain:delete',
  UPDATE_ENTITY: 'brain:update-entity',
} as const;

export type IpcMethodName = (typeof IPC_METHODS)[keyof typeof IPC_METHODS];

export const IPC_EVENTS = {
  ACTIVITY_EDGE: 'activity:edge',
  ACTIVITY_NODE: 'activity:node',
  ACTIVITY_MESSAGE: 'activity:message',
} as const;

export interface ActivityEdgePayload {
  readonly from: string;
  readonly to: string;
  readonly actionType: string;
  readonly preview: string;
}

export interface ActivityNodePayload {
  readonly nodeId: string;
  readonly state: 'active' | 'idle';
}

export interface ActivityMessagePayload {
  readonly id: string;
  readonly from: string;
  readonly fromLabel: string;
  readonly to: string;
  readonly toLabel: string;
  readonly content: string;
  readonly actionType: string;
  readonly timestamp: string;
}

/**
 * Parameter types for each IPC method.
 */
export interface MethodParamsMap {
  [IPC_METHODS.LIST_ENTITIES]: { search?: string; type?: string; limit?: number; offset?: number };
  [IPC_METHODS.GET_ENTITY]: { id: string };
  [IPC_METHODS.LIST_RELATIONS]: { entityId?: string; limit?: number; offset?: number };
  [IPC_METHODS.LIST_OBSERVATIONS]: { type?: string; limit?: number; offset?: number };
  [IPC_METHODS.LIST_EVENTS]: { source?: string; limit?: number; offset?: number };
  [IPC_METHODS.LIST_CONVERSATIONS]: { limit?: number; offset?: number };
  [IPC_METHODS.GET_CONVERSATION]: { id: string; limit?: number; offset?: number };
  [IPC_METHODS.LIST_FACTS]: { limit?: number; offset?: number };
  [IPC_METHODS.GET_STATS]: Record<string, never>;
  [IPC_METHODS.DELETE]: { table: string; id: string };
  [IPC_METHODS.UPDATE_ENTITY]: { id: string; fields: Record<string, unknown> };
}
