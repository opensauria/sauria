import { describe, it, expect } from 'vitest';
import { evaluateEdgeRules } from '../routing.js';
import type { AgentNode, Edge, InboundMessage } from '../types.js';
import { DEFAULT_GROUP_BEHAVIOR } from '../types.js';

const baseNode: AgentNode = {
  id: 'n1',
  platform: 'telegram',
  label: '@bot',
  photo: null,
  position: { x: 0, y: 0 },
  status: 'connected',
  credentials: 'key',
  meta: {},
  workspaceId: 'ws1',
  role: 'assistant',
  autonomy: 'supervised',
  instructions: '',
  groupBehavior: DEFAULT_GROUP_BEHAVIOR,
};

const baseMessage: InboundMessage = {
  sourceNodeId: 'n1',
  platform: 'telegram',
  senderId: 'u1',
  senderIsOwner: false,
  groupId: null,
  content: 'hello billing issue',
  contentType: 'text',
  timestamp: new Date().toISOString(),
};

describe('evaluateEdgeRules', () => {
  it('returns empty for no outgoing edges', () => {
    const actions = evaluateEdgeRules(baseNode, baseMessage, []);
    expect(actions).toHaveLength(0);
  });

  it('triggers always-forward rule', () => {
    const edges: Edge[] = [
      {
        id: 'e1',
        from: 'n1',
        to: 'n2',
        edgeType: 'manual',
        rules: [{ type: 'always', action: 'forward' }],
      },
    ];
    const actions = evaluateEdgeRules(baseNode, baseMessage, edges);
    expect(actions).toHaveLength(1);
    expect(actions[0]?.type).toBe('forward');
  });

  it('triggers keyword rule when content matches', () => {
    const edges: Edge[] = [
      {
        id: 'e1',
        from: 'n1',
        to: 'n2',
        edgeType: 'manual',
        rules: [{ type: 'keyword', condition: 'billing', action: 'notify' }],
      },
    ];
    const actions = evaluateEdgeRules(baseNode, baseMessage, edges);
    expect(actions).toHaveLength(1);
    expect(actions[0]?.type).toBe('notify');
  });

  it('skips keyword rule when content does not match', () => {
    const edges: Edge[] = [
      {
        id: 'e1',
        from: 'n1',
        to: 'n2',
        edgeType: 'manual',
        rules: [{ type: 'keyword', condition: 'shipping', action: 'notify' }],
      },
    ];
    const actions = evaluateEdgeRules(baseNode, baseMessage, edges);
    expect(actions).toHaveLength(0);
  });

  it('skips llm_decided rules (handled separately)', () => {
    const edges: Edge[] = [
      {
        id: 'e1',
        from: 'n1',
        to: 'n2',
        edgeType: 'manual',
        rules: [{ type: 'llm_decided', action: 'forward' }],
      },
    ];
    const actions = evaluateEdgeRules(baseNode, baseMessage, edges);
    expect(actions).toHaveLength(0);
  });

  it('skips priority rules (future extension)', () => {
    const edges: Edge[] = [
      {
        id: 'e1',
        from: 'n1',
        to: 'n2',
        edgeType: 'manual',
        rules: [{ type: 'priority', condition: 'high', action: 'forward' }],
      },
    ];
    const actions = evaluateEdgeRules(baseNode, baseMessage, edges);
    expect(actions).toHaveLength(0);
  });

  it('builds assign action from edge rule', () => {
    const edges: Edge[] = [
      {
        id: 'e1',
        from: 'n1',
        to: 'n2',
        edgeType: 'manual',
        rules: [{ type: 'always', action: 'assign' }],
      },
    ];
    const actions = evaluateEdgeRules(baseNode, baseMessage, edges);
    expect(actions).toHaveLength(1);
    expect(actions[0]?.type).toBe('assign');
    expect((actions[0] as { priority: string }).priority).toBe('normal');
  });

  it('builds send_to_all action from edge rule', () => {
    const edges: Edge[] = [
      {
        id: 'e1',
        from: 'n1',
        to: 'ws1',
        edgeType: 'manual',
        rules: [{ type: 'always', action: 'send_to_all' }],
      },
    ];
    const actions = evaluateEdgeRules(baseNode, baseMessage, edges);
    expect(actions).toHaveLength(1);
    expect(actions[0]?.type).toBe('send_to_all');
  });

  it('uses forward as default for unknown action string', () => {
    const edges: Edge[] = [
      {
        id: 'e1',
        from: 'n1',
        to: 'n2',
        edgeType: 'manual',
        rules: [{ type: 'always', action: 'unknown_action' as Edge['rules'][0]['action'] }],
      },
    ];
    const actions = evaluateEdgeRules(baseNode, baseMessage, edges);
    expect(actions).toHaveLength(1);
    expect(actions[0]?.type).toBe('forward');
  });

  it('skips keyword rule when condition is missing', () => {
    const edges: Edge[] = [
      {
        id: 'e1',
        from: 'n1',
        to: 'n2',
        edgeType: 'manual',
        rules: [{ type: 'keyword', action: 'forward' }],
      },
    ];
    const actions = evaluateEdgeRules(baseNode, baseMessage, edges);
    expect(actions).toHaveLength(0);
  });
});
