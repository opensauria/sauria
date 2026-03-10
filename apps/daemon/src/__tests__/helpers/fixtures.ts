import type {
  AgentNode,
  Workspace,
  CanvasGraph,
  Edge,
  InboundMessage,
  RoutingAction,
} from '@sauria/types';

let counter = 0;
function uid(): string {
  return `test-${++counter}`;
}

export function resetFixtureCounter(): void {
  counter = 0;
}

export function createTestAgent(overrides: Partial<AgentNode> = {}): AgentNode {
  const id = uid();
  return {
    id,
    platform: 'telegram',
    label: `Agent ${id}`,
    photo: null,
    position: { x: 0, y: 0 },
    status: 'connected',
    credentials: '',
    meta: {},
    workspaceId: null,
    role: 'specialist',
    autonomy: 'supervised',
    instructions: '',
    ...overrides,
  };
}

export function createTestWorkspace(overrides: Partial<Workspace> = {}): Workspace {
  const id = uid();
  return {
    id,
    name: `Workspace ${id}`,
    color: '#333333',
    purpose: 'Testing',
    topics: [],
    budget: { dailyLimitUsd: 5.0, preferCheap: false },
    position: { x: 0, y: 0 },
    size: { width: 400, height: 300 },
    checkpoints: [],
    groups: [],
    ...overrides,
  };
}

export function createTestEdge(from: string, to: string, overrides: Partial<Edge> = {}): Edge {
  return {
    id: uid(),
    from,
    to,
    edgeType: 'intra_workspace',
    rules: [],
    ...overrides,
  };
}

export function createTestGraph(overrides: Partial<CanvasGraph> = {}): CanvasGraph {
  return {
    version: 2,
    globalInstructions: '',
    workspaces: [],
    nodes: [],
    edges: [],
    instances: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    ...overrides,
  };
}

export function createTestInboundMessage(overrides: Partial<InboundMessage> = {}): InboundMessage {
  return {
    sourceNodeId: 'node-1',
    senderId: 'user-1',
    senderIsOwner: true,
    platform: 'telegram',
    groupId: null,
    content: 'Hello',
    contentType: 'text',
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

export function createTestRoutingAction(
  type: RoutingAction['type'],
  overrides: Record<string, unknown> = {},
): RoutingAction {
  switch (type) {
    case 'reply':
      return { type: 'reply', content: 'test reply', ...overrides } as RoutingAction;
    case 'forward':
      return {
        type: 'forward',
        targetNodeId: 'target-1',
        content: 'forwarded',
        ...overrides,
      } as RoutingAction;
    case 'learn':
      return { type: 'learn', fact: 'test fact', topics: ['test'], ...overrides } as RoutingAction;
    default:
      return { type, content: 'test', ...overrides } as RoutingAction;
  }
}
