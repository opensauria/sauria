import { describe, it, expect } from 'vitest';
import { AutonomyEnforcer } from '../autonomy.js';
import type { AgentNode, RoutingAction, Workspace } from '../types.js';
import { DEFAULT_GROUP_BEHAVIOR } from '../types.js';

function createAgent(autonomy: AgentNode['autonomy']): AgentNode {
  return {
    id: 'a1',
    platform: 'telegram',
    label: '@agent',
    photo: null,
    position: { x: 0, y: 0 },
    status: 'connected',
    credentials: 'key',
    meta: {},
    workspaceId: 'ws1',
    role: 'specialist',
    autonomy,
    instructions: '',
    groupBehavior: DEFAULT_GROUP_BEHAVIOR,
  };
}

function createWorkspace(id: string, overrides?: Partial<Workspace>): Workspace {
  return {
    id,
    name: `Workspace ${id}`,
    color: '#000',
    purpose: 'testing',
    topics: [],
    budget: { dailyLimitUsd: 10, preferCheap: false },
    position: { x: 0, y: 0 },
    size: { width: 200, height: 200 },
    checkpoints: [],
    groups: [],
    ...overrides,
  };
}

const replyAction: RoutingAction = { type: 'reply', content: 'Hello' };
const forwardAction: RoutingAction = {
  type: 'forward',
  targetNodeId: 'n2',
  content: 'forwarded',
};
const assignAction: RoutingAction = {
  type: 'assign',
  targetNodeId: 'n2',
  task: 'do stuff',
  priority: 'normal',
};
const notifyAction: RoutingAction = {
  type: 'notify',
  targetNodeId: 'n2',
  summary: 'heads up',
};
const sendToAllAction: RoutingAction = {
  type: 'send_to_all',
  workspaceId: 'ws1',
  content: 'broadcast',
};

const allActions: RoutingAction[] = [
  replyAction,
  forwardAction,
  assignAction,
  notifyAction,
  sendToAllAction,
];

describe('AutonomyEnforcer', () => {
  const enforcer = new AutonomyEnforcer();

  describe('filterActions', () => {
    it('full autonomy: all actions are immediate', () => {
      const agent = createAgent('full');
      const { immediate, pendingApproval } = enforcer.filterActions(agent, allActions);
      expect(immediate).toHaveLength(5);
      expect(pendingApproval).toHaveLength(0);
    });

    it('supervised autonomy: all actions are immediate', () => {
      const agent = createAgent('supervised');
      const { immediate, pendingApproval } = enforcer.filterActions(agent, allActions);
      expect(immediate).toHaveLength(5);
      expect(pendingApproval).toHaveLength(0);
    });

    it('approval autonomy: reply is immediate, others pending', () => {
      const agent = createAgent('approval');
      const { immediate, pendingApproval } = enforcer.filterActions(agent, allActions);
      expect(immediate).toHaveLength(1);
      expect(immediate[0]?.type).toBe('reply');
      expect(pendingApproval).toHaveLength(4);
    });

    it('manual autonomy: all actions pending including reply', () => {
      const agent = createAgent('manual');
      const { immediate, pendingApproval } = enforcer.filterActions(agent, allActions);
      expect(immediate).toHaveLength(0);
      expect(pendingApproval).toHaveLength(5);
    });

    it('handles empty action list', () => {
      const agent = createAgent('full');
      const { immediate, pendingApproval } = enforcer.filterActions(agent, []);
      expect(immediate).toHaveLength(0);
      expect(pendingApproval).toHaveLength(0);
    });
  });

  describe('requiresCheckpoint', () => {
    it('between_teams: triggers when target workspace differs', () => {
      const source = createWorkspace('ws1', {
        checkpoints: [{ condition: 'between_teams', approverChannel: 'ceo-chat' }],
      });
      const target = createWorkspace('ws2');

      expect(enforcer.requiresCheckpoint(forwardAction, source, target)).toBe(true);
    });

    it('between_teams: does not trigger within same workspace', () => {
      const source = createWorkspace('ws1', {
        checkpoints: [{ condition: 'between_teams', approverChannel: 'ceo-chat' }],
      });
      const target = createWorkspace('ws1');

      expect(enforcer.requiresCheckpoint(forwardAction, source, target)).toBe(false);
    });

    it('between_teams: does not trigger for reply actions', () => {
      const source = createWorkspace('ws1', {
        checkpoints: [{ condition: 'between_teams', approverChannel: 'ceo-chat' }],
      });
      const target = createWorkspace('ws2');

      expect(enforcer.requiresCheckpoint(replyAction, source, target)).toBe(false);
    });

    it('between_teams: does not trigger when source is null', () => {
      const target = createWorkspace('ws2');

      expect(enforcer.requiresCheckpoint(forwardAction, null, target)).toBe(false);
    });

    it('high_cost: triggers when workspace has deep model and action is forward/assign', () => {
      const source = createWorkspace('ws1', {
        checkpoints: [{ condition: 'high_cost', approverChannel: 'ceo-chat' }],
        models: { deep: 'claude-opus' },
      });

      expect(enforcer.requiresCheckpoint(forwardAction, source, null)).toBe(true);
      expect(enforcer.requiresCheckpoint(assignAction, source, null)).toBe(true);
    });

    it('high_cost: does not trigger for reply', () => {
      const source = createWorkspace('ws1', {
        checkpoints: [{ condition: 'high_cost', approverChannel: 'ceo-chat' }],
        models: { deep: 'claude-opus' },
      });

      expect(enforcer.requiresCheckpoint(replyAction, source, null)).toBe(false);
    });

    it('high_cost: does not trigger without deep model', () => {
      const source = createWorkspace('ws1', {
        checkpoints: [{ condition: 'high_cost', approverChannel: 'ceo-chat' }],
      });

      expect(enforcer.requiresCheckpoint(forwardAction, source, null)).toBe(false);
    });

    it('external_action: triggers for send_to_all, group_message, forward', () => {
      const source = createWorkspace('ws1', {
        checkpoints: [{ condition: 'external_action', approverChannel: 'ceo-chat' }],
      });

      expect(enforcer.requiresCheckpoint(sendToAllAction, source, null)).toBe(true);
      expect(enforcer.requiresCheckpoint(forwardAction, source, null)).toBe(true);
    });

    it('external_action: does not trigger for reply', () => {
      const source = createWorkspace('ws1', {
        checkpoints: [{ condition: 'external_action', approverChannel: 'ceo-chat' }],
      });

      expect(enforcer.requiresCheckpoint(replyAction, source, null)).toBe(false);
    });

    it('no checkpoints configured: always returns false', () => {
      const source = createWorkspace('ws1');

      expect(enforcer.requiresCheckpoint(forwardAction, source, null)).toBe(false);
    });

    it('null source workspace: returns false', () => {
      expect(enforcer.requiresCheckpoint(forwardAction, null, null)).toBe(false);
    });
  });
});
