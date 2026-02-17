import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { applySchema } from '../../db/schema.js';
import { LLMRoutingBrain, parseRoutingResponse } from '../llm-router.js';
import type { RoutingContext } from '../llm-router.js';
import type { InboundMessage, AgentNode, Workspace } from '../types.js';
import { DEFAULT_GROUP_BEHAVIOR } from '../types.js';
import type { ModelRouter } from '../../ai/router.js';

// ─── Fixtures ───────────────────────────────────────────────────────

const baseNode: AgentNode = {
  id: 'n1',
  platform: 'telegram',
  label: '@support-bot',
  photo: null,
  position: { x: 0, y: 0 },
  status: 'connected',
  credentials: 'key',
  meta: {},
  workspaceId: 'ws1',
  role: 'assistant',
  autonomy: 'supervised',
  instructions: 'Handle support queries',
  groupBehavior: DEFAULT_GROUP_BEHAVIOR,
};

const baseWorkspace: Workspace = {
  id: 'ws1',
  name: 'Customer Support',
  color: '#ff0000',
  purpose: 'Handle customer inquiries',
  topics: ['billing', 'shipping', 'returns'],
  budget: { dailyLimitUsd: 5, preferCheap: true },
  position: { x: 0, y: 0 },
  size: { width: 200, height: 200 },
  checkpoints: [],
  groups: [],
};

function buildMessage(overrides: Partial<InboundMessage> = {}): InboundMessage {
  return {
    sourceNodeId: 'n1',
    platform: 'telegram',
    senderId: 'user1',
    senderIsCeo: false,
    groupId: null,
    content: 'Hello, I need help with my order',
    contentType: 'text',
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

function buildContext(overrides: Partial<RoutingContext> = {}): RoutingContext {
  return {
    message: buildMessage(),
    sourceNode: baseNode,
    workspace: baseWorkspace,
    teamNodes: [baseNode],
    ruleActions: [],
    conversationId: null,
    ...overrides,
  };
}

function createMockRouter(responseText: string): ModelRouter {
  async function* mockStream() {
    yield { text: responseText, done: true };
  }

  return {
    reason: vi.fn().mockReturnValue(mockStream()),
    deepAnalyze: vi.fn().mockReturnValue(mockStream()),
    extract: vi.fn(),
    onCostIncurred: vi.fn(),
    getProvider: vi.fn(),
  } as unknown as ModelRouter;
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('LLMRoutingBrain', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    applySchema(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('selectModelTier', () => {
    it('returns local when rule actions exist', () => {
      const router = createMockRouter('{}');
      const brain = new LLMRoutingBrain(router, db);
      const message = buildMessage({ content: 'short' });

      const tier = brain.selectModelTier(message, true);

      expect(tier).toBe('local');
    });

    it('returns local for simple messages under word threshold without question', () => {
      const router = createMockRouter('{}');
      const brain = new LLMRoutingBrain(router, db);
      const message = buildMessage({ content: 'ok thanks' });

      const tier = brain.selectModelTier(message, false);

      expect(tier).toBe('local');
    });

    it('returns fast for messages with question marks', () => {
      const router = createMockRouter('{}');
      const brain = new LLMRoutingBrain(router, db);
      const message = buildMessage({ content: 'How do I fix this?' });

      const tier = brain.selectModelTier(message, false);

      expect(tier).toBe('fast');
    });

    it('returns fast for messages over word threshold', () => {
      const router = createMockRouter('{}');
      const brain = new LLMRoutingBrain(router, db);
      const longContent = Array.from({ length: 25 }, (_, i) => `word${i}`).join(' ');
      const message = buildMessage({ content: longContent });

      const tier = brain.selectModelTier(message, false);

      expect(tier).toBe('fast');
    });

    it('returns deep for messages with strategic keywords', () => {
      const router = createMockRouter('{}');
      const brain = new LLMRoutingBrain(router, db);
      const message = buildMessage({
        content: 'We need to reorganize the team structure and delegate tasks across all teams',
      });

      const tier = brain.selectModelTier(message, false);

      expect(tier).toBe('deep');
    });

    it('returns deep for budget-related strategic messages', () => {
      const router = createMockRouter('{}');
      const brain = new LLMRoutingBrain(router, db);
      const message = buildMessage({
        content:
          'Review the budget allocation and strategy for next quarter across the company-wide initiatives',
      });

      const tier = brain.selectModelTier(message, false);

      expect(tier).toBe('deep');
    });
  });

  describe('decideRouting', () => {
    it('skips LLM when rule actions exist and tier is local', async () => {
      const router = createMockRouter('{}');
      const brain = new LLMRoutingBrain(router, db);
      const context = buildContext({
        ruleActions: [{ type: 'reply', content: 'Handled by rules' }],
      });

      const decision = await brain.decideRouting(context);

      expect(decision.actions).toHaveLength(0);
      expect(router.reason).not.toHaveBeenCalled();
    });

    it('calls reason for fast tier messages', async () => {
      const responseJson = JSON.stringify({
        actions: [{ type: 'reply', content: 'I can help with that order' }],
      });
      const router = createMockRouter(responseJson);
      const brain = new LLMRoutingBrain(router, db);
      const context = buildContext({
        message: buildMessage({
          content: 'Can you help me with my order status and tracking information?',
        }),
      });

      const decision = await brain.decideRouting(context);

      expect(router.reason).toHaveBeenCalled();
      expect(decision.actions).toHaveLength(1);
      expect(decision.actions[0]).toEqual({ type: 'reply', content: 'I can help with that order' });
    });

    it('calls deepAnalyze for deep tier messages', async () => {
      const responseJson = JSON.stringify({
        actions: [{ type: 'reply', content: 'Strategic analysis complete' }],
      });
      const router = createMockRouter(responseJson);
      const brain = new LLMRoutingBrain(router, db);
      const context = buildContext({
        message: buildMessage({
          content:
            'We need to reorganize the entire strategy for our company-wide budget allocation across all teams',
        }),
      });

      const decision = await brain.decideRouting(context);

      expect(router.deepAnalyze).toHaveBeenCalled();
      expect(decision.actions).toHaveLength(1);
    });

    it('returns cached decision on repeated calls', async () => {
      const responseJson = JSON.stringify({
        actions: [{ type: 'reply', content: 'Cached response' }],
      });
      const router = createMockRouter(responseJson);
      const brain = new LLMRoutingBrain(router, db);
      const context = buildContext({
        message: buildMessage({ content: 'What is the status of my refund request?' }),
      });

      const decision1 = await brain.decideRouting(context);

      // Second call should use cache, not invoke the LLM again
      const decision2 = await brain.decideRouting(context);

      expect(decision1).toEqual(decision2);
      // reason should only have been called once (the router mock's generator was consumed)
      expect(router.reason).toHaveBeenCalledTimes(1);
    });

    it('handles LLM returning invalid JSON gracefully', async () => {
      const router = createMockRouter('This is not valid JSON at all');
      const brain = new LLMRoutingBrain(router, db);
      const context = buildContext({
        message: buildMessage({ content: 'What should I do about this complicated issue?' }),
      });

      const decision = await brain.decideRouting(context);

      expect(decision.actions).toHaveLength(0);
    });
  });
});

describe('parseRoutingResponse', () => {
  it('parses valid JSON with reply action', () => {
    const raw = '{"actions": [{"type": "reply", "content": "Hello!"}]}';
    const decision = parseRoutingResponse(raw);

    expect(decision.actions).toHaveLength(1);
    expect(decision.actions[0]).toEqual({ type: 'reply', content: 'Hello!' });
  });

  it('parses valid JSON with forward action', () => {
    const raw =
      '{"actions": [{"type": "forward", "targetNodeId": "n2", "content": "Forwarded msg"}]}';
    const decision = parseRoutingResponse(raw);

    expect(decision.actions).toHaveLength(1);
    expect(decision.actions[0]).toEqual({
      type: 'forward',
      targetNodeId: 'n2',
      content: 'Forwarded msg',
    });
  });

  it('parses assign action with priority', () => {
    const raw =
      '{"actions": [{"type": "assign", "targetNodeId": "n2", "task": "Fix bug", "priority": "high"}]}';
    const decision = parseRoutingResponse(raw);

    expect(decision.actions).toHaveLength(1);
    expect(decision.actions[0]).toEqual({
      type: 'assign',
      targetNodeId: 'n2',
      task: 'Fix bug',
      priority: 'high',
    });
  });

  it('defaults assign priority to normal when invalid', () => {
    const raw =
      '{"actions": [{"type": "assign", "targetNodeId": "n2", "task": "Fix bug", "priority": "urgent"}]}';
    const decision = parseRoutingResponse(raw);

    expect(decision.actions).toHaveLength(1);
    expect(decision.actions[0]).toEqual({
      type: 'assign',
      targetNodeId: 'n2',
      task: 'Fix bug',
      priority: 'normal',
    });
  });

  it('parses notify action', () => {
    const raw =
      '{"actions": [{"type": "notify", "targetNodeId": "n3", "summary": "New ticket filed"}]}';
    const decision = parseRoutingResponse(raw);

    expect(decision.actions[0]).toEqual({
      type: 'notify',
      targetNodeId: 'n3',
      summary: 'New ticket filed',
    });
  });

  it('parses learn action', () => {
    const raw =
      '{"actions": [{"type": "learn", "fact": "Customer prefers email", "topics": ["preferences"]}]}';
    const decision = parseRoutingResponse(raw);

    expect(decision.actions[0]).toEqual({
      type: 'learn',
      fact: 'Customer prefers email',
      topics: ['preferences'],
    });
  });

  it('parses learn action without topics', () => {
    const raw = '{"actions": [{"type": "learn", "fact": "Deadline is Friday"}]}';
    const decision = parseRoutingResponse(raw);

    expect(decision.actions[0]).toEqual({
      type: 'learn',
      fact: 'Deadline is Friday',
      topics: [],
    });
  });

  it('parses send_to_all action', () => {
    const raw =
      '{"actions": [{"type": "send_to_all", "workspaceId": "ws1", "content": "Announcement"}]}';
    const decision = parseRoutingResponse(raw);

    expect(decision.actions[0]).toEqual({
      type: 'send_to_all',
      workspaceId: 'ws1',
      content: 'Announcement',
    });
  });

  it('parses group_message action', () => {
    const raw =
      '{"actions": [{"type": "group_message", "workspaceId": "ws1", "content": "Team update"}]}';
    const decision = parseRoutingResponse(raw);

    expect(decision.actions[0]).toEqual({
      type: 'group_message',
      workspaceId: 'ws1',
      content: 'Team update',
    });
  });

  it('filters out invalid action types', () => {
    const raw =
      '{"actions": [{"type": "invalid_action", "content": "bad"}, {"type": "reply", "content": "good"}]}';
    const decision = parseRoutingResponse(raw);

    expect(decision.actions).toHaveLength(1);
    expect(decision.actions[0]).toEqual({ type: 'reply', content: 'good' });
  });

  it('filters out actions with missing required fields', () => {
    const raw = '{"actions": [{"type": "forward"}, {"type": "reply", "content": "valid"}]}';
    const decision = parseRoutingResponse(raw);

    expect(decision.actions).toHaveLength(1);
    expect(decision.actions[0]).toEqual({ type: 'reply', content: 'valid' });
  });

  it('handles multiple valid actions', () => {
    const raw = JSON.stringify({
      actions: [
        { type: 'reply', content: 'Got it' },
        { type: 'forward', targetNodeId: 'n2', content: 'Please handle this' },
        { type: 'learn', fact: 'Customer uses enterprise plan', topics: ['billing'] },
      ],
    });
    const decision = parseRoutingResponse(raw);

    expect(decision.actions).toHaveLength(3);
  });

  it('returns empty actions for invalid JSON', () => {
    const decision = parseRoutingResponse('not json at all');

    expect(decision.actions).toHaveLength(0);
  });

  it('returns empty actions for JSON without actions array', () => {
    const decision = parseRoutingResponse('{"result": "ok"}');

    expect(decision.actions).toHaveLength(0);
  });

  it('extracts JSON from surrounding text', () => {
    const raw =
      'Here is my analysis:\n\n{"actions": [{"type": "reply", "content": "Done"}]}\n\nHope that helps!';
    const decision = parseRoutingResponse(raw);

    expect(decision.actions).toHaveLength(1);
    expect(decision.actions[0]).toEqual({ type: 'reply', content: 'Done' });
  });

  it('returns empty actions for empty string', () => {
    const decision = parseRoutingResponse('');

    expect(decision.actions).toHaveLength(0);
  });
});
