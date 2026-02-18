import type BetterSqlite3 from 'better-sqlite3';
import type { ModelRouter } from '../ai/router.js';
import type { ChatMessage } from '../ai/providers/base.js';
import type {
  InboundMessage,
  RoutingAction,
  RoutingDecision,
  AgentNode,
  Workspace,
} from './types.js';
import { RoutingCache, buildCacheKey } from './routing-cache.js';
import { AgentMemory } from './agent-memory.js';

// ─── Types ──────────────────────────────────────────────────────────

export type ModelTier = 'local' | 'fast' | 'deep';

export interface RoutingContext {
  readonly message: InboundMessage;
  readonly sourceNode: AgentNode;
  readonly workspace: Workspace | null;
  readonly teamNodes: readonly AgentNode[];
  readonly ruleActions: readonly RoutingAction[];
  readonly conversationId: string | null;
  readonly globalInstructions: string;
}

interface LLMRoutingResponse {
  readonly actions: readonly RawLLMAction[];
}

interface RawLLMAction {
  readonly type: string;
  readonly content?: string;
  readonly targetNodeId?: string;
  readonly task?: string;
  readonly priority?: string;
  readonly summary?: string;
  readonly workspaceId?: string;
  readonly fact?: string;
  readonly topics?: readonly string[];
}

// ─── Constants ──────────────────────────────────────────────────────

const SIMPLE_MESSAGE_WORD_THRESHOLD = 20;

const VALID_ACTION_TYPES = new Set([
  'reply',
  'forward',
  'assign',
  'notify',
  'send_to_all',
  'learn',
  'group_message',
]);

const VALID_PRIORITIES = new Set(['low', 'normal', 'high']);

// ─── LLMRoutingBrain ────────────────────────────────────────────────

export class LLMRoutingBrain {
  private readonly cache: RoutingCache;
  private readonly memory: AgentMemory;

  constructor(
    private readonly router: ModelRouter,
    db: BetterSqlite3.Database,
    cacheTtlMs?: number,
  ) {
    this.cache = new RoutingCache(cacheTtlMs);
    this.memory = new AgentMemory(db);
  }

  async decideRouting(context: RoutingContext): Promise<RoutingDecision> {
    const { message, ruleActions } = context;

    const tier = this.selectModelTier(message, ruleActions.length > 0);
    if (tier === 'local' && ruleActions.length > 0) {
      return { actions: [] };
    }

    const cacheKey = buildCacheKey(message.sourceNodeId, message.content);
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const prompt = buildRoutingPrompt(context, this.memory);
    const decision = await this.callLLM(prompt, tier);

    this.cache.set(cacheKey, decision);

    return decision;
  }

  selectModelTier(message: InboundMessage, hasRuleActions: boolean): ModelTier {
    if (hasRuleActions) {
      return 'local';
    }

    // Check strategic keywords first — short strategic messages must not be classified as simple
    const strategicKeywords = [
      'strategy',
      'budget',
      'reorganize',
      'priority',
      'delegate',
      'escalate',
      'all teams',
      'company-wide',
    ];
    const lowerContent = message.content.toLowerCase();
    const isStrategic = strategicKeywords.some((keyword) => lowerContent.includes(keyword));

    if (isStrategic) {
      return 'deep';
    }

    const wordCount = message.content.trim().split(/\s+/).length;
    const hasQuestion = message.content.includes('?');
    const isSimple = wordCount < SIMPLE_MESSAGE_WORD_THRESHOLD && !hasQuestion;

    if (isSimple) {
      return 'local';
    }

    return 'fast';
  }

  private async callLLM(messages: ChatMessage[], tier: ModelTier): Promise<RoutingDecision> {
    const stream =
      tier === 'deep' ? this.router.deepAnalyze(messages) : this.router.reason(messages);

    let result = '';
    for await (const chunk of stream) {
      result += chunk.text;
    }

    return parseRoutingResponse(result);
  }
}

// ─── Prompt Building ────────────────────────────────────────────────

function buildRoutingPrompt(context: RoutingContext, memory: AgentMemory): ChatMessage[] {
  const { message, sourceNode, workspace, teamNodes, ruleActions, conversationId, globalInstructions } = context;

  const agentList = teamNodes
    .map((node) => `- ${node.label} (${node.role}) on ${node.platform}`)
    .join('\n');

  const ruleActionsText =
    ruleActions.length > 0
      ? `Already-scheduled actions from rules:\n${JSON.stringify(ruleActions, null, 2)}`
      : 'No rule-based actions were triggered.';

  let conversationContext = '';
  if (conversationId) {
    const recentMessages = memory.getConversationHistory(conversationId, 5);
    if (recentMessages.length > 0) {
      conversationContext = recentMessages
        .map((msg) => `[${msg.sourceNodeId}] ${msg.content}`)
        .join('\n');
    }
  }

  let workspaceFactsText = '';
  if (workspace) {
    const facts = memory.getWorkspaceFacts(workspace.id, 5);
    if (facts.length > 0) {
      workspaceFactsText = [
        'Workspace knowledge:',
        ...facts.map((f) => `- ${f}`),
      ].join('\n');
    }
  }

  let peerMessagesText = '';
  if (teamNodes.length > 1) {
    const peerLines: string[] = [];
    for (const peerNode of teamNodes) {
      if (peerNode.id === sourceNode.id) continue;
      const peerConvId = memory.getOrCreateConversation(
        peerNode.platform,
        null,
        [peerNode.id],
      );
      const peerHistory = memory.getConversationHistory(peerConvId, 2);
      for (const msg of peerHistory) {
        peerLines.push(`[${peerNode.label}] ${msg.content}`);
      }
    }
    if (peerLines.length > 0) {
      peerMessagesText = [
        'Recent peer activity:',
        ...peerLines.slice(0, 5),
      ].join('\n');
    }
  }

  const systemPrompt = [
    'You are the routing brain for a team of AI agents.',
    '',
    `Team: ${workspace?.name ?? 'Unknown'}`,
    `Purpose: ${workspace?.purpose ?? 'General'}`,
    `Topics: ${workspace?.topics.join(', ') ?? 'None'}`,
    '',
    'Agents in this team:',
    agentList || '(no agents)',
    '',
    `Incoming message from ${sourceNode.label} (${sourceNode.role}):`,
    `"${message.content}"`,
    '',
    conversationContext
      ? `Recent conversation context:\n${conversationContext}`
      : 'No prior conversation context.',
    '',
    ...(workspaceFactsText ? [workspaceFactsText, ''] : []),
    ...(peerMessagesText ? [peerMessagesText, ''] : []),
    ruleActionsText,
    '',
    `When generating reply content, respond in character as ${sourceNode.meta?.['firstName'] || sourceNode.label.replace(/^@/, '')} (${sourceNode.role ?? 'assistant'}). Never mention being Claude, an AI model, or a language model.`,
    ...(globalInstructions || sourceNode.instructions
      ? [
          'Response style instructions (apply to all reply content):',
          ...(globalInstructions ? [globalInstructions] : []),
          ...(sourceNode.instructions ? [sourceNode.instructions] : []),
          '',
        ]
      : []),
    'Decide what actions to take. Return ONLY valid JSON:',
    '{"actions": [{"type": "reply", "content": "..."}, ...]}',
    '',
    'Valid action types: reply, forward, assign, notify, send_to_all, learn, group_message',
    'For forward/assign/notify: include "targetNodeId"',
    'For assign: include "task" and "priority" (low/normal/high)',
    'For notify: include "summary"',
    'For send_to_all/group_message: include "workspaceId" and "content"',
    'For learn: include "fact" and "topics" (string array)',
  ].join('\n');

  return [
    { role: 'system' as const, content: systemPrompt },
    { role: 'user' as const, content: message.content },
  ];
}

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

    default:
      return null;
  }
}
