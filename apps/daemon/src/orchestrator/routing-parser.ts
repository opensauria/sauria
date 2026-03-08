import type { RoutingAction, RoutingDecision } from './types.js';

// ─── Types ──────────────────────────────────────────────────────────

export interface LLMRoutingResponse {
  readonly actions: readonly RawLLMAction[];
}

export interface RawLLMAction {
  readonly type: string;
  readonly content?: string;
  readonly targetNodeId?: string;
  readonly task?: string;
  readonly priority?: string;
  readonly summary?: string;
  readonly workspaceId?: string;
  readonly fact?: string;
  readonly topics?: readonly string[];
  readonly integration?: string;
  readonly tool?: string;
  readonly arguments?: Readonly<Record<string, unknown>>;
}

// ─── Constants ──────────────────────────────────────────────────────

const VALID_ACTION_TYPES = new Set([
  'reply',
  'forward',
  'assign',
  'notify',
  'send_to_all',
  'learn',
  'group_message',
  'use_tool',
]);

const VALID_PRIORITIES = new Set(['low', 'normal', 'high']);

// ─── Response Parsing ───────────────────────────────────────────────

export function parseRoutingResponse(raw: string): RoutingDecision {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return { actions: [] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    return { actions: [] };
  }

  if (!isLLMRoutingResponse(parsed)) {
    return { actions: [] };
  }

  const actions = parsed.actions
    .map(normalizeAction)
    .filter((action): action is RoutingAction => action !== null);

  return { actions };
}

function isLLMRoutingResponse(value: unknown): value is LLMRoutingResponse {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return Array.isArray(record['actions']);
}

function normalizeAction(raw: RawLLMAction): RoutingAction | null {
  if (!VALID_ACTION_TYPES.has(raw.type)) {
    return null;
  }

  switch (raw.type) {
    case 'reply':
      return raw.content ? { type: 'reply', content: raw.content } : null;

    case 'forward':
      return raw.targetNodeId && raw.content
        ? { type: 'forward', targetNodeId: raw.targetNodeId, content: raw.content }
        : null;

    case 'assign': {
      const priority =
        raw.priority && VALID_PRIORITIES.has(raw.priority)
          ? (raw.priority as 'low' | 'normal' | 'high')
          : 'normal';
      return raw.targetNodeId && raw.task
        ? { type: 'assign', targetNodeId: raw.targetNodeId, task: raw.task, priority }
        : null;
    }

    case 'notify':
      return raw.targetNodeId && raw.summary
        ? { type: 'notify', targetNodeId: raw.targetNodeId, summary: raw.summary }
        : null;

    case 'send_to_all':
      return raw.workspaceId && raw.content
        ? { type: 'send_to_all', workspaceId: raw.workspaceId, content: raw.content }
        : null;

    case 'learn':
      return raw.fact ? { type: 'learn', fact: raw.fact, topics: raw.topics ?? [] } : null;

    case 'group_message':
      return raw.workspaceId && raw.content
        ? { type: 'group_message', workspaceId: raw.workspaceId, content: raw.content }
        : null;

    case 'use_tool':
      return raw.integration && raw.tool && raw.content
        ? {
            type: 'use_tool',
            integration: raw.integration,
            tool: raw.tool,
            arguments: raw.arguments ?? {},
            content: raw.content,
          }
        : null;

    default:
      return null;
  }
}
