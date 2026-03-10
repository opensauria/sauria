import { describe, it, expect, vi } from 'vitest';
import {
  recordReplyInMemory,
  contentPreview,
  buildForwardContext,
  resolveInstanceId,
  findGroupForNode,
  isOwnerChannelNode,
  isOwnerSender,
} from '../orchestrator-helpers.js';
import type { HelperDeps } from '../orchestrator-helpers.js';
import type { AgentNode, CanvasGraph, InboundMessage, OwnerIdentity } from '../types.js';

function makeNode(overrides: Partial<AgentNode> = {}): AgentNode {
  return {
    id: 'n1',
    platform: 'telegram',
    label: '@support_bot',
    photo: null,
    position: { x: 0, y: 0 },
    status: 'connected',
    credentials: 'key',
    meta: {},
    workspaceId: 'ws1',
    role: 'assistant',
    autonomy: 'supervised',
    instructions: '',
    ...overrides,
  } as AgentNode;
}

function makeGraph(
  nodes: AgentNode[] = [makeNode()],
  workspaces: CanvasGraph['workspaces'] = [],
): CanvasGraph {
  return {
    version: 2,
    nodes,
    edges: [],
    workspaces,
    globalInstructions: '',
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

function makeSource(overrides: Partial<InboundMessage> = {}): InboundMessage {
  return {
    sourceNodeId: 'n1',
    platform: 'telegram',
    senderId: 'user1',
    senderIsOwner: false,
    groupId: null,
    content: 'hello',
    contentType: 'text',
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

describe('recordReplyInMemory', () => {
  it('does nothing when agentMemory is null', () => {
    const deps: HelperDeps = {
      graph: makeGraph(),
      agentMemory: null,
      ownerIdentity: {},
      findNode: () => null,
    };
    // Should not throw
    recordReplyInMemory(deps, makeSource(), 'reply content');
  });

  it('records message in agent memory when available', () => {
    const mockRecordMessage = vi.fn();
    const deps: HelperDeps = {
      graph: makeGraph(),
      agentMemory: {
        getOrCreateConversation: vi.fn().mockReturnValue('conv-1'),
        recordMessage: mockRecordMessage,
      } as never,
      ownerIdentity: {},
      findNode: () => null,
    };

    const source = makeSource({ groupId: 'grp1' });
    recordReplyInMemory(deps, source, 'reply content');

    expect(mockRecordMessage).toHaveBeenCalledWith({
      conversationId: 'conv-1',
      sourceNodeId: 'n1',
      senderId: 'n1',
      senderIsOwner: false,
      platform: 'telegram',
      groupId: 'grp1',
      content: 'reply content',
      contentType: 'text',
    });
  });
});

describe('contentPreview', () => {
  it('returns short content unchanged', () => {
    expect(contentPreview('short')).toBe('short');
  });

  it('returns content at exactly 60 chars unchanged', () => {
    const exact = 'a'.repeat(60);
    expect(contentPreview(exact)).toBe(exact);
  });

  it('truncates content longer than 60 chars', () => {
    const long = 'a'.repeat(80);
    const result = contentPreview(long);
    expect(result).toHaveLength(60);
    expect(result).toBe('a'.repeat(57) + '...');
  });
});

describe('buildForwardContext', () => {
  it('returns empty string when agentMemory is null', () => {
    const deps: HelperDeps = {
      graph: makeGraph(),
      agentMemory: null,
      ownerIdentity: {},
      findNode: () => null,
    };
    expect(buildForwardContext(deps, 'n1', 'telegram', null)).toBe('');
  });

  it('returns empty string when source node not found', () => {
    const deps: HelperDeps = {
      graph: makeGraph(),
      agentMemory: {
        getOrCreateConversation: vi.fn(),
        getRecentMessagesForContext: vi.fn(),
      } as never,
      ownerIdentity: {},
      findNode: () => null,
    };
    expect(buildForwardContext(deps, 'unknown', 'telegram', null)).toBe('');
  });

  it('returns empty string when no recent messages', () => {
    const deps: HelperDeps = {
      graph: makeGraph(),
      agentMemory: {
        getOrCreateConversation: vi.fn().mockReturnValue('conv-1'),
        getRecentMessagesForContext: vi.fn().mockReturnValue([]),
      } as never,
      ownerIdentity: {},
      findNode: (id: string) => (id === 'n1' ? makeNode() : null),
    };
    expect(buildForwardContext(deps, 'n1', 'telegram', null)).toBe('');
  });

  it('builds context with recent messages', () => {
    const deps: HelperDeps = {
      graph: makeGraph(),
      agentMemory: {
        getOrCreateConversation: vi.fn().mockReturnValue('conv-1'),
        getRecentMessagesForContext: vi.fn().mockReturnValue(['msg1', 'msg2']),
      } as never,
      ownerIdentity: {},
      findNode: (id: string) => (id === 'n1' ? makeNode() : null),
    };

    const result = buildForwardContext(deps, 'n1', 'telegram', null);
    expect(result).toContain('[Forwarded from @support_bot]');
    expect(result).toContain('[Recent context]:');
    expect(result).toContain('- msg1');
    expect(result).toContain('- msg2');
    expect(result).toContain('[Message]:');
  });
});

describe('resolveInstanceId', () => {
  const graph = makeGraph();

  it('matches by exact id', () => {
    expect(resolveInstanceId(graph, 'inst-1', ['inst-1', 'inst-2'])).toBe('inst-1');
  });

  it('matches by prefix with colon separator', () => {
    expect(resolveInstanceId(graph, 'linear', ['linear:proj-1', 'github:repo-1'])).toBe(
      'linear:proj-1',
    );
  });

  it('matches by integration id from instances array', () => {
    const graphWithInstances = {
      ...graph,
      instances: [{ id: 'inst-abc', integrationId: 'linear', label: 'My Linear', connectedAt: '' }],
    } as CanvasGraph;
    expect(resolveInstanceId(graphWithInstances, 'linear', ['inst-abc'])).toBe('inst-abc');
  });

  it('matches by label case-insensitively', () => {
    const graphWithInstances = {
      ...graph,
      instances: [{ id: 'inst-abc', integrationId: 'something', label: 'My Linear', connectedAt: '' }],
    } as CanvasGraph;
    expect(resolveInstanceId(graphWithInstances, 'my linear', ['inst-abc'])).toBe('inst-abc');
  });

  it('returns null when no match', () => {
    expect(resolveInstanceId(graph, 'missing', ['inst-1', 'inst-2'])).toBeNull();
  });

  it('skips instances not in assignedIds', () => {
    const graphWithInstances = {
      ...graph,
      instances: [{ id: 'inst-abc', integrationId: 'linear', label: 'Linear', connectedAt: '' }],
    } as CanvasGraph;
    expect(resolveInstanceId(graphWithInstances, 'linear', ['other-id'])).toBeNull();
  });

  it('handles graph with no instances array', () => {
    const graphNoInstances = { ...graph } as CanvasGraph;
    delete (graphNoInstances as unknown as Record<string, unknown>)['instances'];
    expect(resolveInstanceId(graphNoInstances, 'something', ['something-else'])).toBeNull();
  });
});

describe('findGroupForNode', () => {
  it('returns null when node not found', () => {
    const deps: HelperDeps = {
      graph: makeGraph(),
      agentMemory: null,
      ownerIdentity: {},
      findNode: () => null,
    };
    const fn = findGroupForNode(deps);
    expect(fn('unknown')).toBeNull();
  });

  it('returns null when node has no workspaceId', () => {
    const node = makeNode({ workspaceId: undefined });
    const deps: HelperDeps = {
      graph: makeGraph([node]),
      agentMemory: null,
      ownerIdentity: {},
      findNode: () => node,
    };
    const fn = findGroupForNode(deps);
    expect(fn('n1')).toBeNull();
  });

  it('returns null when workspace not found', () => {
    const node = makeNode({ workspaceId: 'ws-missing' });
    const deps: HelperDeps = {
      graph: makeGraph([node], []),
      agentMemory: null,
      ownerIdentity: {},
      findNode: () => node,
    };
    const fn = findGroupForNode(deps);
    expect(fn('n1')).toBeNull();
  });

  it('returns null when no matching group for platform', () => {
    const node = makeNode({ workspaceId: 'ws1', platform: 'telegram' });
    const workspace = {
      id: 'ws1',
      name: 'WS',
      color: '#000',
      purpose: '',
      topics: [],
      budget: { dailyLimitUsd: 5, preferCheap: true },
      position: { x: 0, y: 0 },
      size: { width: 400, height: 300 },
      checkpoints: [],
      groups: [{ platform: 'slack' as const, groupId: 'slack-grp', name: 'Slack', ownerMemberId: '', autoCreated: false }],
    };
    const deps: HelperDeps = {
      graph: makeGraph([node], [workspace] as CanvasGraph['workspaces']),
      agentMemory: null,
      ownerIdentity: {},
      findNode: () => node,
    };
    const fn = findGroupForNode(deps);
    expect(fn('n1')).toBeNull();
  });

  it('returns groupId when matching platform group exists', () => {
    const node = makeNode({ workspaceId: 'ws1', platform: 'telegram' });
    const workspace = {
      id: 'ws1',
      name: 'WS',
      color: '#000',
      purpose: '',
      topics: [],
      budget: { dailyLimitUsd: 5, preferCheap: true },
      position: { x: 0, y: 0 },
      size: { width: 400, height: 300 },
      checkpoints: [],
      groups: [{ platform: 'telegram' as const, groupId: 'tg-grp-123', name: 'TG', ownerMemberId: '', autoCreated: false }],
    };
    const deps: HelperDeps = {
      graph: makeGraph([node], [workspace] as CanvasGraph['workspaces']),
      agentMemory: null,
      ownerIdentity: {},
      findNode: () => node,
    };
    const fn = findGroupForNode(deps);
    expect(fn('n1')).toBe('tg-grp-123');
  });
});

describe('isOwnerChannelNode', () => {
  it('returns true for telegram node when owner has telegram identity', () => {
    const owner: OwnerIdentity = { telegram: { userId: 123 } };
    expect(isOwnerChannelNode(owner, makeNode({ platform: 'telegram' }))).toBe(true);
  });

  it('returns true for slack node when owner has slack identity', () => {
    const owner: OwnerIdentity = { slack: { userId: 'U123' } };
    expect(isOwnerChannelNode(owner, makeNode({ platform: 'slack' }))).toBe(true);
  });

  it('returns true for whatsapp node when owner has whatsapp identity', () => {
    const owner: OwnerIdentity = { whatsapp: { phoneNumber: '+1234' } };
    expect(isOwnerChannelNode(owner, makeNode({ platform: 'whatsapp' }))).toBe(true);
  });

  it('returns false for telegram node when owner has no telegram identity', () => {
    const owner: OwnerIdentity = {};
    expect(isOwnerChannelNode(owner, makeNode({ platform: 'telegram' }))).toBe(false);
  });

  it('returns false for discord node (no discord owner identity support)', () => {
    const owner: OwnerIdentity = { telegram: { userId: 123 } };
    expect(isOwnerChannelNode(owner, makeNode({ platform: 'discord' }))).toBe(false);
  });
});

describe('isOwnerSender', () => {
  it('matches telegram owner by userId', () => {
    const owner: OwnerIdentity = { telegram: { userId: 123 } };
    expect(isOwnerSender(owner, 'telegram', '123')).toBe(true);
  });

  it('does not match wrong telegram userId', () => {
    const owner: OwnerIdentity = { telegram: { userId: 123 } };
    expect(isOwnerSender(owner, 'telegram', '999')).toBe(false);
  });

  it('matches slack owner by userId', () => {
    const owner: OwnerIdentity = { slack: { userId: 'U123' } };
    expect(isOwnerSender(owner, 'slack', 'U123')).toBe(true);
  });

  it('does not match wrong slack userId', () => {
    const owner: OwnerIdentity = { slack: { userId: 'U123' } };
    expect(isOwnerSender(owner, 'slack', 'U999')).toBe(false);
  });

  it('matches whatsapp owner by phoneNumber', () => {
    const owner: OwnerIdentity = { whatsapp: { phoneNumber: '+1234' } };
    expect(isOwnerSender(owner, 'whatsapp', '+1234')).toBe(true);
  });

  it('does not match wrong whatsapp phoneNumber', () => {
    const owner: OwnerIdentity = { whatsapp: { phoneNumber: '+1234' } };
    expect(isOwnerSender(owner, 'whatsapp', '+9999')).toBe(false);
  });

  it('returns false for platform without owner identity', () => {
    const owner: OwnerIdentity = {};
    expect(isOwnerSender(owner, 'telegram', '123')).toBe(false);
  });

  it('returns false for unsupported platform', () => {
    const owner: OwnerIdentity = { telegram: { userId: 123 } };
    expect(isOwnerSender(owner, 'discord', '123')).toBe(false);
  });
});

describe('additional coverage — edge cases', () => {
  it('contentPreview handles single character', () => {
    expect(contentPreview('x')).toBe('x');
  });

  it('contentPreview handles exactly 61 chars', () => {
    const str = 'a'.repeat(61);
    const result = contentPreview(str);
    expect(result).toHaveLength(60);
    expect(result.endsWith('...')).toBe(true);
  });

  it('buildForwardContext with groupId passes it to getOrCreateConversation', () => {
    const getOrCreateConversation = vi.fn().mockReturnValue('conv-1');
    const getRecentMessagesForContext = vi.fn().mockReturnValue(['msg1']);
    const deps: HelperDeps = {
      graph: makeGraph(),
      agentMemory: { getOrCreateConversation, getRecentMessagesForContext } as never,
      ownerIdentity: {},
      findNode: (id: string) => (id === 'n1' ? makeNode() : null),
    };

    buildForwardContext(deps, 'n1', 'telegram', 'group-id-1');
    expect(getOrCreateConversation).toHaveBeenCalledWith('telegram', 'group-id-1', ['n1']);
  });

  it('recordReplyInMemory with groupId', () => {
    const getOrCreateConversation = vi.fn().mockReturnValue('conv-1');
    const recordMessage = vi.fn();
    const deps: HelperDeps = {
      graph: makeGraph(),
      agentMemory: { getOrCreateConversation, recordMessage } as never,
      ownerIdentity: {},
      findNode: () => null,
    };
    const source = makeSource({ groupId: 'grp-x', sourceNodeId: 'a1' });
    recordReplyInMemory(deps, source, 'reply');
    expect(getOrCreateConversation).toHaveBeenCalledWith('telegram', 'grp-x', ['a1']);
  });

  it('resolveInstanceId returns null for empty assignedIds', () => {
    expect(resolveInstanceId(makeGraph(), 'ref', [])).toBeNull();
  });

  it('isOwnerChannelNode with all three identities returns true for each platform', () => {
    const owner: OwnerIdentity = {
      telegram: { userId: 1 },
      slack: { userId: 'U1' },
      whatsapp: { phoneNumber: '+1' },
    };
    expect(isOwnerChannelNode(owner, makeNode({ platform: 'telegram' }))).toBe(true);
    expect(isOwnerChannelNode(owner, makeNode({ platform: 'slack' }))).toBe(true);
    expect(isOwnerChannelNode(owner, makeNode({ platform: 'whatsapp' }))).toBe(true);
  });

  it('isOwnerSender with all three identities matches each', () => {
    const owner: OwnerIdentity = {
      telegram: { userId: 42 },
      slack: { userId: 'UABC' },
      whatsapp: { phoneNumber: '+5678' },
    };
    expect(isOwnerSender(owner, 'telegram', '42')).toBe(true);
    expect(isOwnerSender(owner, 'slack', 'UABC')).toBe(true);
    expect(isOwnerSender(owner, 'whatsapp', '+5678')).toBe(true);
  });
});
