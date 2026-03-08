import type { InboundMessage, AgentNode, Workspace } from './types.js';
import type { IntegrationRegistry } from '../integrations/registry.js';
import { buildMessageSection } from './forward-parser.js';

// ─── Language ───────────────────────────────────────────────────────

const LANGUAGE_CODE_TO_NAME: Readonly<Record<string, string>> = {
  en: 'English',
  fr: 'French',
  es: 'Spanish',
  de: 'German',
  it: 'Italian',
  pt: 'Portuguese',
  nl: 'Dutch',
  ru: 'Russian',
  uk: 'Ukrainian',
  pl: 'Polish',
  cs: 'Czech',
  sk: 'Slovak',
  hu: 'Hungarian',
  ro: 'Romanian',
  bg: 'Bulgarian',
  hr: 'Croatian',
  sr: 'Serbian',
  sl: 'Slovenian',
  lv: 'Latvian',
  lt: 'Lithuanian',
  et: 'Estonian',
  sv: 'Swedish',
  no: 'Norwegian',
  da: 'Danish',
  fi: 'Finnish',
  el: 'Greek',
  tr: 'Turkish',
  ar: 'Arabic',
  he: 'Hebrew',
  hi: 'Hindi',
  bn: 'Bengali',
  ta: 'Tamil',
  te: 'Telugu',
  mr: 'Marathi',
  gu: 'Gujarati',
  ur: 'Urdu',
  fa: 'Persian',
  zh: 'Chinese',
  ja: 'Japanese',
  ko: 'Korean',
  th: 'Thai',
  vi: 'Vietnamese',
  id: 'Indonesian',
  ms: 'Malay',
  tl: 'Filipino',
  sw: 'Swahili',
  am: 'Amharic',
  yo: 'Yoruba',
  ha: 'Hausa',
  zu: 'Zulu',
  af: 'Afrikaans',
  ca: 'Catalan',
  eu: 'Basque',
  gl: 'Galician',
  cy: 'Welsh',
  ga: 'Irish',
  ka: 'Georgian',
  hy: 'Armenian',
  az: 'Azerbaijani',
  uz: 'Uzbek',
  kk: 'Kazakh',
  mn: 'Mongolian',
  ne: 'Nepali',
  si: 'Sinhala',
  km: 'Khmer',
  lo: 'Lao',
  my: 'Burmese',
};

const LANGUAGE_DIRECTIVE_PATTERN =
  /(?:always\s+(?:reply|respond|answer|write|speak)|(?:reply|respond|answer|write|speak)\s+(?:only\s+)?in)\s+(english|french|spanish|german|italian|portuguese|arabic|chinese|japanese|korean|russian|dutch|swedish|norwegian|danish|finnish|polish|czech|hungarian|romanian|turkish|hindi|thai|vietnamese|indonesian|malay|filipino|hebrew|greek|ukrainian|bulgarian|croatian|serbian|slovak|slovenian|latvian|lithuanian|estonian|bengali|tamil|telugu|marathi|gujarati|urdu|persian|farsi|swahili|amharic|yoruba|hausa|zulu|afrikaans|catalan|basque|galician|welsh|irish|georgian|armenian|azerbaijani|uzbek|kazakh|mongolian|nepali|sinhala|khmer|lao|burmese)/i;

function extractLanguageDirective(instructions: string): string | null {
  const match = instructions.match(LANGUAGE_DIRECTIVE_PATTERN);
  return match ? match[1]!.charAt(0).toUpperCase() + match[1]!.slice(1).toLowerCase() : null;
}

// ─── Tools Section ──────────────────────────────────────────────────

export function buildToolsSection(
  integrationRegistry?: IntegrationRegistry | null,
  agentInstanceIds?: readonly string[],
): string[] {
  if (!integrationRegistry) return [];

  const tools =
    agentInstanceIds && agentInstanceIds.length > 0
      ? integrationRegistry.getToolsForInstances(agentInstanceIds)
      : integrationRegistry.getAvailableTools();

  if (tools.length === 0) return [];

  const toolLines = tools.slice(0, 20).map((t) => {
    const desc = t.description ? t.description.slice(0, 80) : 'no description';
    return `- integration="${t.instanceId}" tool="${t.name}": ${desc}`;
  });
  return ['Available tools (use "use_tool" action to invoke):', ...toolLines, ''];
}

// ─── Prompt Template Assembly ───────────────────────────────────────

export interface PromptPartsInput {
  readonly workspace: Workspace | null;
  readonly agentList: string;
  readonly otherAgentsList: string;
  readonly message: InboundMessage;
  readonly sourceNode: AgentNode;
  readonly conversationContext: string;
  readonly workspaceFactsText: string;
  readonly agentFactsText: string;
  readonly knowledgeGraphText: string;
  readonly peerMessagesText: string;
  readonly integrationRegistry?: IntegrationRegistry | null;
  readonly ruleActionsText: string;
  readonly globalInstructions: string;
}

export function buildPromptParts(input: PromptPartsInput): string[] {
  const { workspace, agentList, otherAgentsList, message, sourceNode } = input;
  const { conversationContext, workspaceFactsText, agentFactsText } = input;
  const { knowledgeGraphText, peerMessagesText, integrationRegistry } = input;
  const { ruleActionsText, globalInstructions } = input;

  return [
    'You are the routing brain for a team of AI agents.',
    '',
    `Team: ${workspace?.name ?? 'Unknown'}`,
    `Purpose: ${workspace?.purpose ?? 'General'}`,
    `Topics: ${workspace?.topics.join(', ') ?? 'None'}`,
    '',
    'Agents in this team:',
    agentList || '(no agents)',
    '',
    ...(otherAgentsList
      ? [
          'Agents in other workspaces (you can forward to them for cross-team collaboration):',
          otherAgentsList,
          '',
        ]
      : []),
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
    ...buildToolsSection(integrationRegistry, sourceNode.integrations),
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
    'FORMATTING (critical): Plain text only. No markdown, no asterisks, no hashes, no backticks, no bullets, no emojis. Write like a natural human text message.',
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
    'For use_tool: include "integration" (exact instance ID from the tool list, e.g. "notion:default"), "tool" (exact tool name, e.g. "API-post-search"), "arguments" (JSON object), and "content" (explanation to owner). Use the EXACT values from the tool list — do not combine or modify them.',
    '',
    'COLLABORATION: When you receive a forwarded message from another agent, ALWAYS reply to confirm understanding and provide your response. Your reply is automatically routed back to the sender internally. Like real teamwork — always confirm, never leave colleagues in the dark.',
    "INTERNAL DEBATE: When you receive a forwarded message from another agent, your reply goes back to that agent internally. The owner does NOT see intermediate debate. Only the agent who received the owner's original message sends the final answer to the owner.",
    "DELEGATION: When the user asks you to communicate with, ask, or send something to another agent by name, you MUST use the forward action with that agent's targetNodeId. Never answer on behalf of another agent. Never fabricate what another agent would say.",
    'REPLY vs FORWARD: "reply" sends your response (to owner for direct messages, to sender agent for forwarded messages). "forward" sends to a DIFFERENT agent. Use reply to continue a discussion, forward to involve someone new.',
    'ATTRIBUTION: When you reply to the owner after receiving a forwarded request from another agent, always mention who asked you and why. Example: "[AgentName] asked me to give my opinion on X. Here is what I think: ..." This gives the owner context about why you are reaching out.',
  ];
}

// ─── Behavior & Language Appendages ─────────────────────────────────

export function appendBehaviorToggles(promptParts: string[], sourceNode: AgentNode): void {
  const behavior = sourceNode.behavior;
  if (behavior?.ownerResponse === false) {
    promptParts.push(
      'RESPONSE MODE: Silent mode. Do NOT reply to the owner unless directly asked. Focus on internal tasks, forwarding, and collaboration.',
    );
  }
  if (behavior?.proactive === true) {
    promptParts.push(
      'PROACTIVE MODE: Proactively share relevant information and suggest actions without waiting to be asked.',
    );
  }
  if (behavior?.peer === false) {
    promptParts.push(
      'PEER ISOLATION: Do NOT collaborate with other agents. Work independently. Ignore forwarded requests from peers and do not forward to others.',
    );
  }
}

export function appendLanguageDirective(
  promptParts: string[],
  globalInstructions: string,
  sourceNode: AgentNode,
  language?: string,
): void {
  const allInstructions = [globalInstructions, sourceNode.instructions].filter(Boolean).join('\n');
  const detectedLanguage = extractLanguageDirective(allInstructions);
  const graphLanguage =
    language && language !== 'auto' ? (LANGUAGE_CODE_TO_NAME[language] ?? language) : null;

  const effectiveLanguage = detectedLanguage ?? graphLanguage;

  if (effectiveLanguage) {
    promptParts.push(
      '',
      `MANDATORY LANGUAGE: You MUST write ALL content (replies, forwards, summaries, agent-to-agent messages) in ${effectiveLanguage}. This overrides everything else. Even if the user writes in another language, you MUST respond in ${effectiveLanguage}.`,
    );
  } else {
    promptParts.push(
      '',
      'LANGUAGE: Match the language of the incoming message. If the user writes in French, respond in French. If in English, respond in English.',
    );
  }
}
