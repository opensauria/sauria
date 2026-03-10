import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock ClaudeCodeService
const mockSendMessage = vi.fn();
const mockSetPermissionMode = vi.fn();
const mockResetSession = vi.fn();
const mockStop = vi.fn();
let mockIsBusy = false;

vi.mock('../../channels/claude-code-service.js', () => {
  class MockClaudeCodeService {
    sendMessage = mockSendMessage;
    setPermissionMode = mockSetPermissionMode;
    resetSession = mockResetSession;
    stop = mockStop;
    get isBusy() {
      return mockIsBusy;
    }
    get currentSessionId() {
      return null;
    }
  }
  return {
    validateProjectPath: vi.fn((p: string) => {
      if (p === '/invalid') throw new Error('Project path does not exist: /invalid');
      return p;
    }),
    ClaudeCodeService: MockClaudeCodeService,
  };
});

// Mock formatter
vi.mock('../../channels/claude-code-formatter.js', () => ({
  formatCodeResponse: vi.fn((raw: string) => raw),
}));

// Mock logger
vi.mock('../../utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { CodeModeRouter } from '../code-mode-router.js';
import type { AgentNode, InboundMessage, RoutingAction } from '../types.js';
import type { AuditLogger } from '../../security/audit.js';

// ─── Fixtures ─────────────────────────────────────────────────────

function makeNode(overrides: Partial<AgentNode> = {}): AgentNode {
  return {
    id: 'n1',
    platform: 'telegram',
    label: '@code_bot',
    photo: null,
    position: { x: 0, y: 0 },
    status: 'connected',
    credentials: 'key',
    meta: {},
    workspaceId: 'ws1',
    role: 'assistant',
    autonomy: 'supervised',
    instructions: '',
    codeMode: {
      enabled: true,
      projectPath: '/Users/teo/project',
      permissionMode: 'default',
    },
    ...overrides,
  };
}

function makeMessage(content: string): InboundMessage {
  return {
    sourceNodeId: 'n1',
    platform: 'telegram',
    senderId: '123',
    senderIsOwner: true,
    groupId: null,
    content,
    contentType: 'text',
    timestamp: new Date().toISOString(),
  };
}

/** Narrow a RoutingAction to the reply variant for assertion convenience. */
function replyContent(action: RoutingAction): string {
  if (action.type !== 'reply') throw new Error(`Expected reply, got ${action.type}`);
  return action.content;
}

function mockAudit(): AuditLogger {
  return {
    logAction: vi.fn(),
    hashContent: vi.fn().mockReturnValue('hash'),
  } as unknown as AuditLogger;
}

// ─── Tests ────────────────────────────────────────────────────────

describe('CodeModeRouter', () => {
  let router: CodeModeRouter;
  let audit: AuditLogger;

  beforeEach(() => {
    vi.clearAllMocks();
    mockIsBusy = false;
    mockSendMessage.mockResolvedValue('Claude response');
    audit = mockAudit();
    router = new CodeModeRouter(audit);
  });

  it('routes message and returns reply with formatted response', async () => {
    const actions = await router.route(makeNode(), makeMessage('fix the bug'));
    expect(actions).toHaveLength(1);
    expect(actions[0]).toEqual({ type: 'reply', content: 'Claude response' });
    expect(mockSendMessage).toHaveBeenCalledWith('fix the bug');
  });

  it('/reset resets session and returns confirmation', async () => {
    // First route to create the service
    await router.route(makeNode(), makeMessage('hello'));

    const actions = await router.route(makeNode(), makeMessage('/reset'));
    expect(actions).toHaveLength(1);
    expect(replyContent(actions[0]!)).toContain('session reset');
    expect(audit.logAction).toHaveBeenCalledWith(
      'claude-code:session-reset',
      expect.objectContaining({ nodeId: 'n1' }),
    );
  });

  it('/plan switches permission mode', async () => {
    const actions = await router.route(makeNode(), makeMessage('/plan'));
    expect(actions).toHaveLength(1);
    expect(replyContent(actions[0]!)).toContain('plan');
    expect(audit.logAction).toHaveBeenCalledWith(
      'claude-code:mode-switch',
      expect.objectContaining({ mode: 'plan' }),
    );
  });

  it('/auto switches permission mode', async () => {
    const actions = await router.route(makeNode(), makeMessage('/auto'));
    expect(replyContent(actions[0]!)).toContain('auto');
  });

  it('/accept-edits switches permission mode', async () => {
    const actions = await router.route(makeNode(), makeMessage('/accept-edits'));
    expect(replyContent(actions[0]!)).toContain('acceptEdits');
  });

  it('/default switches permission mode', async () => {
    const actions = await router.route(makeNode(), makeMessage('/default'));
    expect(replyContent(actions[0]!)).toContain('default');
  });

  it('rate limits after exceeding per-minute cap', async () => {
    const node = makeNode();

    // checkRateLimit skips non-existent trackers (call 1), then increments on calls 2-11
    for (let i = 0; i < 11; i++) {
      await router.route(node, makeMessage(`msg ${i}`));
    }

    const actions = await router.route(node, makeMessage('one too many'));
    expect(actions).toHaveLength(1);
    expect(replyContent(actions[0]!)).toContain('Rate limit');
  });

  it('returns per-node busy message when service is still processing', async () => {
    await router.route(makeNode(), makeMessage('first'));
    mockIsBusy = true;

    const actions = await router.route(makeNode(), makeMessage('second'));
    expect(actions).toHaveLength(1);
    expect(replyContent(actions[0]!)).toContain('still processing');
  });

  it('returns error when project path is invalid', async () => {
    const node = makeNode({
      codeMode: { enabled: true, projectPath: '/invalid', permissionMode: 'default' },
    });
    const actions = await router.route(node, makeMessage('test'));
    expect(actions).toHaveLength(1);
    expect(replyContent(actions[0]!)).toContain('error');
  });

  it('returns error when sendMessage fails', async () => {
    mockSendMessage.mockRejectedValue(new Error('CLI crashed'));
    const actions = await router.route(makeNode(), makeMessage('crash'));
    expect(actions).toHaveLength(1);
    expect(replyContent(actions[0]!)).toContain('CLI crashed');
  });

  it('returns empty actions when code mode disabled', async () => {
    const node = makeNode({
      codeMode: { enabled: false, projectPath: '/Users/teo/project', permissionMode: 'default' },
    });
    const actions = await router.route(node, makeMessage('test'));
    expect(actions).toHaveLength(0);
  });

  it('returns empty actions when projectPath missing', async () => {
    const node = makeNode({
      codeMode: { enabled: true, projectPath: '', permissionMode: 'default' },
    });
    const actions = await router.route(node, makeMessage('test'));
    expect(actions).toHaveLength(0);
  });

  it('recreates service when projectPath changes', async () => {
    const node1 = makeNode({
      codeMode: { enabled: true, projectPath: '/Users/teo/project-a', permissionMode: 'default' },
    });
    await router.route(node1, makeMessage('hello'));
    expect(mockSendMessage).toHaveBeenCalledTimes(1);

    // Change project path — should stop old service and create new one
    const node2 = makeNode({
      codeMode: { enabled: true, projectPath: '/Users/teo/project-b', permissionMode: 'default' },
    });
    await router.route(node2, makeMessage('world'));
    expect(mockStop).toHaveBeenCalledTimes(1);
    expect(mockSendMessage).toHaveBeenCalledTimes(2);
  });

  it('updates permissionMode without recreating service', async () => {
    await router.route(makeNode(), makeMessage('hello'));

    const updated = makeNode({
      codeMode: { enabled: true, projectPath: '/Users/teo/project', permissionMode: 'plan' },
    });
    await router.route(updated, makeMessage('world'));
    expect(mockSetPermissionMode).toHaveBeenCalledWith('plan');
    expect(mockStop).not.toHaveBeenCalled();
  });

  it('stopAll stops all services', async () => {
    await router.route(makeNode({ id: 'a' }), makeMessage('one'));
    await router.route(makeNode({ id: 'b' }), makeMessage('two'));
    router.stopAll();
    expect(mockStop).toHaveBeenCalledTimes(2);
  });
});
