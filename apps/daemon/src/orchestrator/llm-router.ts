import type BetterSqlite3 from 'better-sqlite3';
import type { ModelRouter } from '../ai/router.js';
import type { ChatMessage } from '../ai/providers/base.js';
import type {
  InboundMessage,
  RoutingAction,
  RoutingDecision,
  AgentNode,
  Edge,
  Workspace,
} from './types.js';
import { RoutingCache, buildCacheKey } from './routing-cache.js';
import { type AgentMemory, estimateTokens } from './agent-memory.js';
import { searchByKeyword } from '../db/search.js';

// ─── Types ──────────────────────────────────────────────────────────

export type ModelTier = 'local' | 'fast' | 'deep';

export interface RoutingContext {
  readonly message: InboundMessage;
  readonly sourceNode: AgentNode;
  readonly workspace: Workspace | null;
  readonly teamNodes: readonly AgentNode[];
  readonly edges: readonly Edge[];
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
  'escalate',
]);

const VALID_PRIORITIES = new Set(['low', 'normal', 'high']);

const LLM_ROUTING_TIMEOUT_MS = 30_000;
const MAX_PROMPT_TOKENS = 4000;

// ─── LLMRoutingBrain ────────────────────────────────────────────────

export class LLMRoutingBrain {
  private readonly cache: RoutingCache;

  constructor(
    private readonly router: ModelRouter,
    private readonly memory: AgentMemory,
    private readonly db: BetterSqlite3.Database,
    cacheTtlMs?: number,
  ) {
    this.cache = new RoutingCache(cacheTtlMs);
  }

  async decideRouting(context: RoutingContext): Promise<RoutingDecision> {
    const { message, ruleActions } = context;

    const tier = this.selectModelTier(message, ruleActions.length > 0);
    if (tier === 'local' && ruleActions.length > 0) {
      return { actions: [] };
    }

    const cacheKey = buildCacheKey(message.sourceNodeId, message.content, context.conversationId);
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const prompt = buildRoutingPrompt(context, this.memory, this.db);
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

    const collect = async (): Promise<string> => {
      let result = '';
      for await (const chunk of stream) {
        result += chunk.text;
      }
      return result;
    };

    const timeout = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('LLM routing timeout')), LLM_ROUTING_TIMEOUT_MS);
    });

    const result = await Promise.race([collect(), timeout]);
    return parseRoutingResponse(result);
  }
}

// ─── Prompt Building ────────────────────────────────────────────────

function buildRoutingPrompt(
  context: RoutingContext,
  memory: AgentMemory,
  db: BetterSqlite3.Database,
): ChatMessage[] {
  const {
    message,
    sourceNode,
    workspace,
    teamNodes,
    edges,
    ruleActions,
    conversationId,
    globalInstructions,
  } = context;

  const agentList = teamNodes
    .map((node) => {
      let line = `- ${node.label} (${node.role}) on ${node.platform}`;
      if (node.capabilities) {
        const parts: string[] = [];
        if (node.capabilities.directories?.length) {
          parts.push(`dirs: ${node.capabilities.directories.join(', ')}`);
        }
        if (node.capabilities.tools?.length) {
          parts.push(`tools: ${node.capabilities.tools.join(', ')}`);
        }
        if (node.capabilities.description) {
          parts.push(node.capabilities.description);
        }
        if (parts.length > 0) line += ` [${parts.join('; ')}]`;
      }
      return line;
    })
    .join('\n');

  const ruleActionsText =
    ruleActions.length > 0
      ? `Already-scheduled actions from rules:\n${JSON.stringify(ruleActions, null, 2)}`
      : 'No rule-based actions were triggered.';

  const TOKEN_BUDGET_HISTORY = 1500;
  let conversationContext = '';
  if (conversationId) {
    const recentMessages = memory.getHistoryWithinBudget(conversationId, TOKEN_BUDGET_HISTORY);
    if (recentMessages.length > 0) {
      conversationContext = recentMessages
        .map((msg) => `[${msg.sourceNodeId}] ${msg.content}`)
        .join('\n');
    }
  }

  let agentFactsText = '';
  const agentFacts = memory.getAgentFacts(sourceNode.id, 5);
  if (agentFacts.length > 0) {
    agentFactsText = ['Agent knowledge:', ...agentFacts.map((f) => `- ${f}`)].join('\n');
  }

  let workspaceFactsText = '';
  if (workspace) {
    const facts = memory.getWorkspaceFacts(workspace.id, 5);
    if (facts.length > 0) {
      workspaceFactsText = ['Workspace knowledge:', ...facts.map((f) => `- ${f}`)].join('\n');
    }
  }

  let peerMessagesText = '';
  if (teamNodes.length > 1) {
    const peerLines: string[] = [];
    for (const peerNode of teamNodes) {
      if (peerNode.id === sourceNode.id) continue;
      const peerConvId = memory.getOrCreateConversation(peerNode.platform, null, [peerNode.id]);
      const peerHistory = memory.getConversationHistory(peerConvId, 2);
      for (const msg of peerHistory) {
        peerLines.push(`[${peerNode.label}] ${msg.content}`);
      }
    }
    if (peerLines.length > 0) {
      peerMessagesText = ['Recent peer activity:', ...peerLines.slice(0, 3)].join('\n');
    }
  }

  let knowledgeGraphText = '';
  const entities = searchByKeyword(db, message.content, 5);
  if (entities.length > 0) {
    const entityLines: string[] = [];
    let tokenCount = 0;
    const TOKEN_BUDGET_KNOWLEDGE = 400;
    for (const entity of entities) {
      const line = `- ${entity.name} (${entity.type}): ${entity.summary ?? 'no details'}`;
      const lineTokens = estimateTokens(line);
      if (tokenCount + lineTokens > TOKEN_BUDGET_KNOWLEDGE) break;
      tokenCount += lineTokens;
      entityLines.push(line);
    }
    if (entityLines.length > 0) {
      knowledgeGraphText = ['Known entities:', ...entityLines].join('\n');
    }
  }

  // Derive hierarchy from edges
  const directReports = edges
    .filter((e) => e.from === sourceNode.id)
    .map((e) => teamNodes.find((n) => n.id === e.to))
    .filter((n): n is AgentNode => n !== undefined);

  const supervisors = edges
    .filter((e) => e.to === sourceNode.id)
    .map((e) => teamNodes.find((n) => n.id === e.from))
    .filter((n): n is AgentNode => n !== undefined);

  let hierarchyText = '';
  if (directReports.length > 0 || supervisors.length > 0) {
    const lines: string[] = ['Hierarchy:'];
    if (supervisors.length > 0) {
      lines.push(`You report to: ${supervisors.map((n) => n.label).join(', ')}`);
    }
    if (directReports.length > 0) {
      lines.push(
        `Your direct reports: ${directReports.map((n) => `${n.label} (${n.role})`).join(', ')}`,
      );
    }
    hierarchyText = lines.join('\n');
  }

  // ─── Build prompt sections (ordered by priority for truncation) ─────
  // Priority: action schema > agents/hierarchy > history > instructions > knowledge/peers

  const characterName = sourceNode.meta?.['firstName'] || sourceNode.label.replace(/^@/, '');

  // Core sections (never truncated)
  const coreSections = [
    `Role: routing brain for AI agent team.`,
    `Team: ${workspace?.name ?? 'Unknown'} | Purpose: ${workspace?.purpose ?? 'General'} | Topics: ${workspace?.topics.join(', ') ?? 'None'}`,
    '',
    'Agents:',
    agentList || '(none)',
    '',
    ...(hierarchyText ? [hierarchyText, ''] : []),
    `From: ${sourceNode.label} (${sourceNode.role})`,
    '',
    conversationContext
      ? `Recent conversation context:\n${conversationContext}`
      : 'No prior conversation context.',
    '',
    ...(message.internalRoute
      ? [
          `Forwarded internally from ${
            teamNodes.find((n) => n.id === message.internalRoute!.fromNodeId)?.label ??
            message.internalRoute.fromNodeId
          } (hop ${String(message.internalRoute.hopCount)}). Do NOT forward back to ${message.internalRoute.fromNodeId} unless you have new info.`,
          'When replying, briefly state who asked you and what for at the start so the recipient has context.',
          '',
        ]
      : []),
    ruleActionsText,
    '',
    `Reply in character as ${characterName} (${sourceNode.role ?? 'assistant'}). Never mention being an AI. Never use em dashes or en dashes.`,
    ...(globalInstructions || sourceNode.instructions
      ? [
          'Style:',
          ...(globalInstructions ? [globalInstructions] : []),
          ...(sourceNode.instructions ? [sourceNode.instructions] : []),
          '',
        ]
      : []),
    ...(directReports.length > 0
      ? [
          'DELEGATION: reply directly if you can; forward to reports for their input; compile responses before replying.',
          `Delegates: ${directReports.map((n) => `${n.label} (${n.id})`).join(', ')}`,
          '',
        ]
      : []),
    'Output JSON only: {"actions": [{"type": "reply", "content": "..."}, ...]}',
    'Types: reply, forward (targetNodeId+content), assign (targetNodeId+task+priority:low/normal/high), notify (targetNodeId+summary), send_to_all (workspaceId+content), learn (fact+topics[]), group_message (workspaceId+content), escalate (summary)',
    ...(message.senderIsOwner ? ['senderIsOwner=true: do NOT escalate, reply directly.'] : []),
  ];

  // Lower-priority sections (truncated first if over budget)
  const softSections = [
    ...(workspaceFactsText ? [workspaceFactsText] : []),
    ...(agentFactsText ? [agentFactsText] : []),
    ...(knowledgeGraphText ? [knowledgeGraphText] : []),
    ...(peerMessagesText ? [peerMessagesText] : []),
  ];

  let systemPrompt = [...coreSections, ...softSections].join('\n');

  // Safety cap: truncate soft sections if over budget
  const promptTokens = estimateTokens(systemPrompt);
  if (promptTokens > MAX_PROMPT_TOKENS && softSections.length > 0) {
    systemPrompt = coreSections.join('\n');
  }

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

    case 'escalate':
      return raw.summary ? { type: 'escalate', summary: raw.summary } : null;

    default:
      return null;
  }
}
