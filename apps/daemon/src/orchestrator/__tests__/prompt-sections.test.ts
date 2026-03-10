import { describe, it, expect } from 'vitest';
import {
  buildToolsSection,
  buildPromptParts,
  appendBehaviorToggles,
  appendLanguageDirective,
} from '../prompt-sections.js';
import type { PromptPartsInput } from '../prompt-sections.js';
import type { AgentNode, InboundMessage, Workspace } from '../types.js';

function makeNode(overrides: Partial<AgentNode> = {}): AgentNode {
  return {
    id: 'node-1',
    label: '@karl_bot',
    platform: 'telegram',
    role: 'specialist',
    autonomy: 'semi',
    status: 'connected',
    workspaceId: 'ws-1',
    ...overrides,
  } as AgentNode;
}

function makeMessage(overrides: Partial<InboundMessage> = {}): InboundMessage {
  return {
    sourceNodeId: 'node-1',
    senderId: 'user-1',
    senderIsOwner: true,
    platform: 'telegram',
    groupId: null,
    content: 'Hello',
    contentType: 'text',
    forwardDepth: 0,
    ...overrides,
  } as InboundMessage;
}

function makeWorkspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    id: 'ws-1',
    name: 'Engineering',
    purpose: 'Build things',
    topics: ['code', 'infra'],
    groups: [],
    ...overrides,
  } as Workspace;
}

function makePromptInput(overrides: Partial<PromptPartsInput> = {}): PromptPartsInput {
  return {
    workspace: makeWorkspace(),
    agentList: '- @karl_bot (specialist) [nodeId: "node-1"] on telegram',
    otherAgentsList: '',
    message: makeMessage(),
    sourceNode: makeNode(),
    conversationContext: '',
    workspaceFactsText: '',
    agentFactsText: '',
    knowledgeGraphText: '',
    peerMessagesText: '',
    ruleActionsText: 'No rule-based actions were triggered.',
    globalInstructions: '',
    forwardDepth: 0,
    ...overrides,
  };
}

describe('buildToolsSection', () => {
  it('returns empty array when no integration registry', () => {
    expect(buildToolsSection(null)).toEqual([]);
    expect(buildToolsSection(undefined)).toEqual([]);
  });

  it('returns empty array when no tools available', () => {
    const registry = { getAvailableTools: () => [], getToolsForInstances: () => [] };
    expect(buildToolsSection(registry as never)).toEqual([]);
  });

  it('builds tool lines from available tools', () => {
    const registry = {
      getAvailableTools: () => [
        { instanceId: 'notion:default', name: 'search', description: 'Search Notion pages' },
      ],
      getToolsForInstances: () => [],
    };
    const result = buildToolsSection(registry as never);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toContain('Available tools');
    expect(result[1]).toContain('notion:default');
    expect(result[1]).toContain('search');
  });

  it('uses getToolsForInstances when agentInstanceIds provided', () => {
    const registry = {
      getAvailableTools: () => [],
      getToolsForInstances: (ids: readonly string[]) =>
        ids.includes('notion:default')
          ? [{ instanceId: 'notion:default', name: 'search', description: 'Search' }]
          : [],
    };
    const result = buildToolsSection(registry as never, ['notion:default']);
    expect(result.length).toBeGreaterThan(0);
    expect(result[1]).toContain('notion:default');
  });
});

describe('buildPromptParts', () => {
  it('includes workspace name and purpose', () => {
    const input = makePromptInput();
    const result = buildPromptParts(input);
    const joined = result.join('\n');
    expect(joined).toContain('Engineering');
    expect(joined).toContain('Build things');
  });

  it('includes workspace topics', () => {
    const input = makePromptInput();
    const result = buildPromptParts(input);
    const joined = result.join('\n');
    expect(joined).toContain('code, infra');
  });

  it('includes agent list with nodeIds', () => {
    const input = makePromptInput();
    const result = buildPromptParts(input);
    const joined = result.join('\n');
    expect(joined).toContain('@karl_bot');
    expect(joined).toContain('nodeId: "node-1"');
  });

  it('includes other agents list when provided', () => {
    const input = makePromptInput({
      otherAgentsList:
        '- @alice (analyst) [nodeId: "node-2"] in workspace "Research" on telegram',
    });
    const result = buildPromptParts(input);
    const joined = result.join('\n');
    expect(joined).toContain('other workspaces');
    expect(joined).toContain('@alice');
  });

  it('omits other agents section when empty', () => {
    const input = makePromptInput({ otherAgentsList: '' });
    const result = buildPromptParts(input);
    const joined = result.join('\n');
    expect(joined).not.toContain('other workspaces');
  });

  it('includes agent identity from label', () => {
    const input = makePromptInput({ sourceNode: makeNode({ label: '@karl_bot' }) });
    const result = buildPromptParts(input);
    const joined = result.join('\n');
    expect(joined).toContain('Your name is karl_bot');
  });

  it('uses firstName from meta when available', () => {
    const input = makePromptInput({
      sourceNode: makeNode({ meta: { firstName: 'Karl' } }),
    });
    const result = buildPromptParts(input);
    const joined = result.join('\n');
    expect(joined).toContain('Your name is Karl');
  });

  it('includes agent instructions when set', () => {
    const input = makePromptInput({
      sourceNode: makeNode({ instructions: 'Be friendly and concise' }),
    });
    const result = buildPromptParts(input);
    const joined = result.join('\n');
    expect(joined).toContain('Be friendly and concise');
    expect(joined).toContain('AGENT PERSONA');
  });

  it('includes conversation context when provided', () => {
    const input = makePromptInput({ conversationContext: '[node-1] Hi there' });
    const result = buildPromptParts(input);
    const joined = result.join('\n');
    expect(joined).toContain('[node-1] Hi there');
  });

  it('includes debate depth hints for depth >= 5', () => {
    const input = makePromptInput({ forwardDepth: 5 });
    const result = buildPromptParts(input);
    const joined = result.join('\n');
    expect(joined).toContain('Start wrapping up');
  });

  it('includes mandatory stop for depth >= 8', () => {
    const input = makePromptInput({ forwardDepth: 8 });
    const result = buildPromptParts(input);
    const joined = result.join('\n');
    expect(joined).toContain('MUST wrap up now');
  });

  it('includes global instructions when provided', () => {
    const input = makePromptInput({ globalInstructions: 'Always be professional' });
    const result = buildPromptParts(input);
    const joined = result.join('\n');
    expect(joined).toContain('Always be professional');
  });
});

describe('appendBehaviorToggles', () => {
  it('appends silent mode when ownerResponse is false', () => {
    const parts: string[] = [];
    appendBehaviorToggles(parts, makeNode({ behavior: { ownerResponse: false } }));
    expect(parts.some((p) => p.includes('Silent mode'))).toBe(true);
  });

  it('appends proactive mode when proactive is true', () => {
    const parts: string[] = [];
    appendBehaviorToggles(parts, makeNode({ behavior: { proactive: true } }));
    expect(parts.some((p) => p.includes('PROACTIVE MODE'))).toBe(true);
  });

  it('appends peer isolation when peer is false', () => {
    const parts: string[] = [];
    appendBehaviorToggles(parts, makeNode({ behavior: { peer: false } }));
    expect(parts.some((p) => p.includes('PEER ISOLATION'))).toBe(true);
  });

  it('does not append anything when behavior is undefined', () => {
    const parts: string[] = [];
    appendBehaviorToggles(parts, makeNode());
    expect(parts).toHaveLength(0);
  });

  it('does not append anything when all toggles are default', () => {
    const parts: string[] = [];
    appendBehaviorToggles(
      parts,
      makeNode({ behavior: { ownerResponse: true, proactive: false, peer: true } }),
    );
    expect(parts).toHaveLength(0);
  });
});

describe('appendLanguageDirective', () => {
  it('appends language matching directive when no explicit language', () => {
    const parts: string[] = [];
    appendLanguageDirective(parts, '', makeNode());
    expect(parts.some((p) => p.includes('Match the language'))).toBe(true);
  });

  it('appends mandatory language from graph language setting', () => {
    const parts: string[] = [];
    appendLanguageDirective(parts, '', makeNode(), 'fr');
    expect(parts.some((p) => p.includes('French'))).toBe(true);
    expect(parts.some((p) => p.includes('MANDATORY LANGUAGE'))).toBe(true);
  });

  it('extracts language directive from global instructions', () => {
    const parts: string[] = [];
    appendLanguageDirective(parts, 'Always reply in Spanish', makeNode());
    expect(parts.some((p) => p.includes('Spanish'))).toBe(true);
  });

  it('extracts language directive from agent instructions', () => {
    const parts: string[] = [];
    appendLanguageDirective(parts, '', makeNode({ instructions: 'Always respond in French' }));
    expect(parts.some((p) => p.includes('French'))).toBe(true);
  });

  it('prefers detected language over graph language', () => {
    const parts: string[] = [];
    appendLanguageDirective(
      parts,
      'Always reply in German',
      makeNode(),
      'fr',
    );
    expect(parts.some((p) => p.includes('German'))).toBe(true);
  });

  it('ignores auto language setting', () => {
    const parts: string[] = [];
    appendLanguageDirective(parts, '', makeNode(), 'auto');
    expect(parts.some((p) => p.includes('Match the language'))).toBe(true);
  });
});
