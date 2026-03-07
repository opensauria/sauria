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
import type { IntegrationRegistry } from '../integrations/registry.js';
import { buildRoutingPrompt } from './routing-prompt.js';
import { parseRoutingResponse } from './routing-parser.js';

// Re-export for backward compatibility
export { parseRoutingResponse } from './routing-parser.js';

// ─── Types ──────────────────────────────────────────────────────────

export type ModelTier = 'local' | 'fast' | 'deep';

export interface RoutingContext {
  readonly message: InboundMessage;
  readonly sourceNode: AgentNode;
  readonly workspace: Workspace | null;
  readonly teamNodes: readonly AgentNode[];
  readonly allNodes?: readonly AgentNode[];
  readonly allWorkspaces?: readonly Workspace[];
  readonly ruleActions: readonly RoutingAction[];
  readonly conversationId: string | null;
  readonly globalInstructions: string;
  readonly language?: string;
}

// ─── Constants ──────────────────────────────────────────────────────

const SIMPLE_MESSAGE_WORD_THRESHOLD = 20;

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

  async summarizeToolResult(
    agentName: string,
    originalMessage: string,
    toolName: string,
    rawResult: string,
  ): Promise<string> {
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: [
          `You are ${agentName}. Summarize the "${toolName}" result for the user. Extract key info from JSON. Say clearly if empty. Match user language. Plain text only, no markdown/emojis/formatting.`,
        ].join('\n'),
      },
      {
        role: 'user',
        content: `User asked: "${originalMessage}"\n\nRaw tool result:\n${rawResult}`,
      },
    ];

    let result = '';
    for await (const chunk of this.router.reason(messages)) {
      result += chunk.text;
    }
    return result.trim();
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
