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
import { AgentMemory, estimateTokens } from './agent-memory.js';
import { searchByKeyword } from '../db/search.js';
import type { IntegrationRegistry } from '../integrations/registry.js';

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
  readonly integration?: string;
  readonly tool?: string;
  readonly arguments?: Readonly<Record<string, unknown>>;
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
  'use_tool',
]);

const VALID_PRIORITIES = new Set(['low', 'normal', 'high']);

// ─── LLMRoutingBrain ────────────────────────────────────────────────

export class LLMRoutingBrain {
  private readonly cache: RoutingCache;
  private readonly memory: AgentMemory;
  readonly integrationRegistry: IntegrationRegistry | null;

  constructor(
    private readonly router: ModelRouter,
    private readonly db: BetterSqlite3.Database,
    cacheTtlMs?: number,
    integrationRegistry?: IntegrationRegistry,
  ) {
    this.cache = new RoutingCache(cacheTtlMs);
    this.memory = new AgentMemory(db);
    this.integrationRegistry = integrationRegistry ?? null;
  }

  clearCache(): void {
    this.cache.clear();
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

    const prompt = buildRoutingPrompt(context, this.memory, this.db, this.integrationRegistry);
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

// ─── Forward Content Parser ──────────────────────────────────────────

interface ParsedForward {
  readonly senderLabel: string;
  readonly context: readonly string[];
  readonly actualMessage: string;
}

function parseForwardedContent(content: string): ParsedForward | null {
  const senderMatch = content.match(/^\[(?:Forwarded|Reply) from ([^\]]+)\]\s*/);
  if (!senderMatch) return null;

  const messageMarker = content.indexOf('\n[Message]:\n');
  if (messageMarker === -1) {
    return { senderLabel: senderMatch[1]!, context: [], actualMessage: content };
  }

  const contextBlock = content.slice(senderMatch[0].length, messageMarker);
  const contextLines = contextBlock
    .split('\n')
    .filter((l) => l.startsWith('- '))
    .map((l) => l.slice(2));

  const actualMessage = content.slice(messageMarker + '\n[Message]:\n'.length).trim();

  return { senderLabel: senderMatch[1]!, context: contextLines, actualMessage };
}

function buildMessageSection(message: InboundMessage, sourceNode: AgentNode): string[] {
  const isForwarded = (message.forwardDepth ?? 0) > 0;

  if (!isForwarded) {
    return [
      `Incoming message from ${sourceNode.label} (${sourceNode.role}):`,
      `"${message.content}"`,
    ];
  }

  const parsed = parseForwardedContent(message.content);
  const isReply = message.content.startsWith('[Reply from ');

  if (!parsed) {
    const verb = isReply ? 'a reply' : 'a forwarded message';
    return [
      `${sourceNode.label} (${sourceNode.role}) received ${verb}:`,
      `"${message.content}"`,
    ];
  }

  const verb = isReply ? 'a reply from' : 'a message forwarded by';
  const lines: string[] = [
    `${sourceNode.label} (${sourceNode.role}) received ${verb} ${parsed.senderLabel}.`,
  ];

  if (parsed.context.length > 0) {
    lines.push('Conversation context leading to this forward:');
    for (const ctx of parsed.context) {
      lines.push(`  ${ctx}`);
    }
  }

  lines.push('', `The actual request/message:`, `"${parsed.actualMessage}"`);
  lines.push(
    '',
    `CRITICAL: Reply naturally to the actual request above. Do NOT echo or repeat the forwarding metadata. Respond as if ${parsed.senderLabel} asked you directly.`,
  );

  return lines;
}

// ─── Language Extraction ─────────────────────────────────────────────

const LANGUAGE_DIRECTIVE_PATTERN =
  /(?:always\s+(?:reply|respond|answer|write|speak)|(?:reply|respond|answer|write|speak)\s+(?:only\s+)?in)\s+(english|french|spanish|german|italian|portuguese|arabic|chinese|japanese|korean|russian|dutch|swedish|norwegian|danish|finnish|polish|czech|hungarian|romanian|turkish|hindi|thai|vietnamese|indonesian|malay|filipino|hebrew|greek|ukrainian|bulgarian|croatian|serbian|slovak|slovenian|latvian|lithuanian|estonian)/i;

function extractLanguageDirective(instructions: string): string | null {
  const match = instructions.match(LANGUAGE_DIRECTIVE_PATTERN);
  return match ? match[1]!.charAt(0).toUpperCase() + match[1]!.slice(1).toLowerCase() : null;
}

function buildToolsSection(integrationRegistry?: IntegrationRegistry | null): string[] {
  if (!integrationRegistry) return [];
  const tools = integrationRegistry.getAvailableTools();
  if (tools.length === 0) return [];

  const toolLines = tools
    .slice(0, 20)
    .map((t) => `- ${t.integrationName}/${t.name}: ${t.description ?? 'no description'}`);
  return ['Available tools (use "use_tool" action to invoke):', ...toolLines, ''];
}

// ─── Prompt Building ────────────────────────────────────────────────

function buildRoutingPrompt(
  context: RoutingContext,
  memory: AgentMemory,
  db: BetterSqlite3.Database,
  integrationRegistry?: IntegrationRegistry | null,
): ChatMessage[] {
  const {
    message,
    sourceNode,
    workspace,
    teamNodes,
    ruleActions,
    conversationId,
    globalInstructions,
  } = context;

  const agentList = teamNodes
    .map((node) => `- ${node.label} (${node.role}) [nodeId: "${node.id}"] on ${node.platform}`)
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
      peerMessagesText = ['Recent peer activity:', ...peerLines.slice(0, 5)].join('\n');
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

  const promptParts = [
    'You are the routing brain for a team of AI agents.',
    '',
    `Team: ${workspace?.name ?? 'Unknown'}`,
    `Purpose: ${workspace?.purpose ?? 'General'}`,
    `Topics: ${workspace?.topics.join(', ') ?? 'None'}`,
    '',
    'Agents in this team:',
    agentList || '(no agents)',
    '',
    ...buildMessageSection(message, sourceNode),
    '',
    conversationContext
      ? `Recent conversation context:\n${conversationContext}`
      : 'No prior conversation context.',
    '',
    ...(workspaceFactsText ? [workspaceFactsText, ''] : []),
    ...(agentFactsText ? [agentFactsText, ''] : []),
    ...(knowledgeGraphText ? [knowledgeGraphText, ''] : []),
    ...(peerMessagesText ? [peerMessagesText, ''] : []),
    ...buildToolsSection(integrationRegistry),
    ruleActionsText,
    '',
    `IDENTITY: Your name is ${sourceNode.meta?.['firstName'] || sourceNode.label.replace(/^@/, '')}. You are ${sourceNode.role ?? 'assistant'}. Never use any other name. Never mention being Claude, an AI model, or a language model.`,
    ...(sourceNode.instructions
      ? [
          `AGENT PERSONA (this defines WHO you are — embody this fully in every response):`,
          sourceNode.instructions,
          '',
        ]
      : []),
    'FORMATTING: Write plain text only. Never use asterisks, markdown, bold, italic, bullet points, headers, or any special formatting characters. Keep messages short and natural like a human chat message.',
    ...(globalInstructions
      ? [
          'Communication style (applies to tone and language of all responses):',
          globalInstructions,
          '',
        ]
      : []),
    'Decide what actions to take. Return ONLY valid JSON:',
    '{"actions": [{"type": "reply", "content": "..."}, ...]}',
    '',
    'Valid action types: reply, forward, assign, notify, send_to_all, learn, group_message, use_tool',
    'For forward/assign/notify: include "targetNodeId"',
    'For assign: include "task" and "priority" (low/normal/high)',
    'For notify: include "summary"',
    'For send_to_all/group_message: include "workspaceId" and "content"',
    'For learn: include "fact" and "topics" (string array)',
    'For use_tool: include "integration" (id), "tool" (name), "arguments" (JSON object), and "content" (explanation to owner)',
    '',
    'COLLABORATION: When you receive a forwarded message from another agent, ALWAYS reply to confirm understanding and provide your response. Your reply is automatically routed back to the sender AND to the owner if you have your own channel. Like real teamwork — always confirm, never leave colleagues in the dark.',
    "DELEGATION: When the user asks you to communicate with, ask, or send something to another agent by name, you MUST use the forward action with that agent's targetNodeId. Never answer on behalf of another agent. Never fabricate what another agent would say.",
    'REPLY vs FORWARD: "reply" sends your response (to owner for direct messages, to sender agent for forwarded messages). "forward" sends to a DIFFERENT agent. Use reply to continue a discussion, forward to involve someone new.',
    'ATTRIBUTION: When you reply to the owner after receiving a forwarded request from another agent, always mention who asked you and why. Example: "[AgentName] asked me to give my opinion on X. Here is what I think: ..." This gives the owner context about why you are reaching out.',
  ];

  // Extract explicit language directive from instructions and inject at the very end
  // for maximum LLM attention (recency bias)
  const allInstructions = [globalInstructions, sourceNode.instructions].filter(Boolean).join('\n');
  const detectedLanguage = extractLanguageDirective(allInstructions);

  if (detectedLanguage) {
    promptParts.push(
      '',
      `MANDATORY LANGUAGE: You MUST write ALL content (replies, forwards, summaries, agent-to-agent messages) in ${detectedLanguage}. This overrides everything else. Even if the user writes in another language, you MUST respond in ${detectedLanguage}.`,
    );
  } else {
    promptParts.push(
      '',
      'LANGUAGE: Match the language of the incoming message. If the user writes in French, respond in French. If in English, respond in English.',
    );
  }

  const systemPrompt = promptParts.join('\n');

  const isForwarded = (message.forwardDepth ?? 0) > 0;
  const parsed = isForwarded ? parseForwardedContent(message.content) : null;
  const userContent = parsed?.actualMessage ?? message.content;

  return [
    { role: 'system' as const, content: systemPrompt },
    { role: 'user' as const, content: userContent },
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
