import type BetterSqlite3 from 'better-sqlite3';
import type { ChatMessage } from '../ai/providers/base.js';
import type { AgentNode, Workspace } from './types.js';
import type { IntegrationRegistry } from '../integrations/registry.js';
import type { AgentMemory } from './agent-memory.js';
import { estimateTokens } from './agent-memory.js';
import { searchByKeyword } from '../db/search.js';
import type { RoutingContext } from './llm-router.js';
import { parseForwardedContent } from './forward-parser.js';
import {
  buildPromptParts,
  appendBehaviorToggles,
  appendLanguageDirective,
} from './prompt-sections.js';

// ─── Prompt Building ────────────────────────────────────────────────

export function buildRoutingPrompt(
  context: RoutingContext,
  memory: AgentMemory,
  db: BetterSqlite3.Database,
  integrationRegistry?: IntegrationRegistry | null,
  maxToolsInPrompt?: number,
): ChatMessage[] {
  const {
    message,
    sourceNode,
    workspace,
    teamNodes,
    allNodes,
    ruleActions,
    conversationId,
    globalInstructions,
  } = context;

  const agentList = teamNodes
    .map((node) => `- ${node.label} (${node.role}) [nodeId: "${node.id}"] on ${node.platform}`)
    .join('\n');

  const otherAgentsList = buildOtherAgentsList(allNodes, sourceNode, context.allWorkspaces ?? []);

  const ruleActionsText =
    ruleActions.length > 0
      ? `Already-scheduled actions from rules:\n${JSON.stringify(ruleActions, null, 2)}`
      : 'No rule-based actions were triggered.';

  const conversationContext = buildConversationContext(memory, conversationId);
  const agentFactsText = buildAgentFacts(memory, sourceNode.id);
  const workspaceFactsText = buildWorkspaceFacts(memory, workspace);
  const peerMessagesText = buildPeerMessages(memory, teamNodes, sourceNode.id);
  const knowledgeGraphText = buildKnowledgeGraph(db, message.content);

  const promptParts = buildPromptParts({
    workspace,
    agentList,
    otherAgentsList,
    message,
    sourceNode,
    conversationContext,
    workspaceFactsText,
    agentFactsText,
    knowledgeGraphText,
    peerMessagesText,
    integrationRegistry,
    ruleActionsText,
    globalInstructions,
    forwardDepth: message.forwardDepth ?? 0,
    maxToolsInPrompt,
  });

  appendBehaviorToggles(promptParts, sourceNode);
  appendLanguageDirective(promptParts, globalInstructions, sourceNode, context.language);

  const systemPrompt = promptParts.join('\n');

  const isForwarded = (message.forwardDepth ?? 0) > 0;
  const parsed = isForwarded ? parseForwardedContent(message.content) : null;
  const userContent = parsed?.actualMessage ?? message.content;

  return [
    { role: 'system' as const, content: systemPrompt },
    { role: 'user' as const, content: userContent },
  ];
}

// ─── Context Gatherers ──────────────────────────────────────────────

function buildOtherAgentsList(
  allNodes: readonly AgentNode[] | undefined,
  sourceNode: AgentNode,
  allWorkspaces: readonly Workspace[],
): string {
  const otherWorkspaceNodes = allNodes
    ? allNodes.filter((n) => n.workspaceId !== sourceNode.workspaceId && n.platform !== 'owner')
    : [];
  return otherWorkspaceNodes
    .map((n) => {
      const ws = allWorkspaces.find((w) => w.id === n.workspaceId);
      return `- ${n.label} (${n.role}) [nodeId: "${n.id}"] in workspace "${ws?.name ?? 'unknown'}" on ${n.platform}`;
    })
    .join('\n');
}

function buildConversationContext(memory: AgentMemory, conversationId: string | null): string {
  if (!conversationId) return '';
  const TOKEN_BUDGET_HISTORY = 1500;
  const recentMessages = memory.getHistoryWithinBudget(conversationId, TOKEN_BUDGET_HISTORY);
  if (recentMessages.length === 0) return '';
  return recentMessages.map((msg) => `[${msg.sourceNodeId}] ${msg.content}`).join('\n');
}

function buildAgentFacts(memory: AgentMemory, nodeId: string): string {
  const agentFacts = memory.getAgentFacts(nodeId, 5);
  if (agentFacts.length === 0) return '';
  return ['Agent knowledge:', ...agentFacts.map((f) => `- ${f}`)].join('\n');
}

function buildWorkspaceFacts(memory: AgentMemory, workspace: Workspace | null): string {
  if (!workspace) return '';
  const facts = memory.getWorkspaceFacts(workspace.id, 5);
  if (facts.length === 0) return '';
  return ['Workspace knowledge:', ...facts.map((f) => `- ${f}`)].join('\n');
}

function buildPeerMessages(
  memory: AgentMemory,
  teamNodes: readonly AgentNode[],
  sourceNodeId: string,
): string {
  if (teamNodes.length <= 1) return '';
  const peerLines: string[] = [];
  for (const peerNode of teamNodes) {
    if (peerNode.id === sourceNodeId) continue;
    const peerConvId = memory.getOrCreateConversation(peerNode.platform, null, [peerNode.id]);
    const peerHistory = memory.getConversationHistory(peerConvId, 2);
    for (const msg of peerHistory) {
      peerLines.push(`[${peerNode.label}] ${msg.content}`);
    }
  }
  if (peerLines.length === 0) return '';
  return ['Recent peer activity:', ...peerLines.slice(0, 5)].join('\n');
}

function buildKnowledgeGraph(db: BetterSqlite3.Database, content: string): string {
  const entities = searchByKeyword(db, content, 5);
  if (entities.length === 0) return '';
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
  if (entityLines.length === 0) return '';
  return ['Known entities:', ...entityLines].join('\n');
}
