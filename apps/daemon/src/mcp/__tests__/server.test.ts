import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: class {
    tool = vi.fn();
    connect = vi.fn().mockResolvedValue(undefined);
    constructor(_opts: Record<string, unknown>) {}
  },
}));
vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: class {},
}));
vi.mock('../../security/rate-limiter.js', () => ({
  createLimiter: vi.fn(() => ({ tryConsume: vi.fn(() => true) })),
  SECURITY_LIMITS: { mcp: { maxQueriesPerMinute: 30, maxConcurrentClients: 5 } },
}));
vi.mock('../tools.js', () => {
  const { z } = require('zod');
  const makeSchema = (shape: Record<string, unknown>) => ({ shape, parse: vi.fn((v: unknown) => v) });
  return {
    TOOL_DEFS: {
      sauria_query: { description: 'd', schema: makeSchema({ query: z.string() }) },
      sauria_get_entity: { description: 'd', schema: makeSchema({ name: z.string() }) },
      sauria_search: { description: 'd', schema: makeSchema({ query: z.string() }) },
      sauria_get_upcoming: { description: 'd', schema: makeSchema({}) },
      sauria_get_insights: { description: 'd', schema: makeSchema({}) },
      sauria_get_context_for: { description: 'd', schema: makeSchema({ topic: z.string() }) },
      sauria_add_event: { description: 'd', schema: makeSchema({}) },
      sauria_remember: { description: 'd', schema: makeSchema({}) },
      sauria_pending_approvals: { description: 'd', schema: makeSchema({}) },
      sauria_approve: { description: 'd', schema: makeSchema({}) },
      sauria_reject: { description: 'd', schema: makeSchema({}) },
    },
    validateToolInput: vi.fn((_, v: unknown) => v),
  };
});
vi.mock('../server-helpers.js', () => ({
  registerTool: vi.fn(),
  textResult: vi.fn((t: string) => ({ content: [{ type: 'text', text: t }] })),
  formatEntity: vi.fn(() => 'formatted'),
  isObservationRow: vi.fn(() => true),
}));
vi.mock('../server-tools.js', () => ({
  createQueryHandler: vi.fn(() => vi.fn()),
  createGetEntityHandler: vi.fn(() => vi.fn()),
  createSearchHandler: vi.fn(() => vi.fn()),
  createUpcomingHandler: vi.fn(() => vi.fn()),
  createInsightsHandler: vi.fn(() => vi.fn()),
  createContextHandler: vi.fn(() => vi.fn()),
}));
vi.mock('../server-tools-write.js', () => ({
  createAddEventHandler: vi.fn(() => vi.fn()),
  createRememberHandler: vi.fn(() => vi.fn()),
}));

import { startMcpServer } from '../server.js';
import { registerTool } from '../server-helpers.js';

const mockDb = {} as unknown as import('better-sqlite3').Database;
const mockRouter = {} as unknown as import('../../ai/router.js').ModelRouter;
const mockAudit = {
  logAction: vi.fn(),
  hashContent: vi.fn(() => 'hash'),
} as unknown as import('../../security/audit.js').AuditLogger;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('startMcpServer', () => {
  it('registers 8 base tools and connects', async () => {
    const server = await startMcpServer({ db: mockDb, router: mockRouter, audit: mockAudit });
    expect(server).toBeDefined();
    expect(registerTool).toHaveBeenCalledTimes(8);
  });

  it('registers approval tools when checkpointManager is provided', async () => {
    const checkpointManager = {
      getPending: vi.fn(() => []),
      approve: vi.fn(() => []),
      reject: vi.fn(),
    };
    vi.mocked(registerTool).mockClear();
    await startMcpServer({
      db: mockDb,
      router: mockRouter,
      audit: mockAudit,
      checkpointManager: checkpointManager as never,
    });
    expect(registerTool).toHaveBeenCalledTimes(11);
  });
});

describe('additional coverage — startMcpServer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not register approval tools without checkpointManager', async () => {
    vi.mocked(registerTool).mockClear();
    await startMcpServer({ db: mockDb, router: mockRouter, audit: mockAudit });
    // Should only register 8 base tools
    expect(registerTool).toHaveBeenCalledTimes(8);

    const toolNames = vi.mocked(registerTool).mock.calls.map((c) => c[1]);
    expect(toolNames).not.toContain('sauria_pending_approvals');
    expect(toolNames).not.toContain('sauria_approve');
    expect(toolNames).not.toContain('sauria_reject');
  });

  it('registers all 8 base tool names', async () => {
    vi.mocked(registerTool).mockClear();
    await startMcpServer({ db: mockDb, router: mockRouter, audit: mockAudit });

    const toolNames = vi.mocked(registerTool).mock.calls.map((c) => c[1]);
    expect(toolNames).toContain('sauria_query');
    expect(toolNames).toContain('sauria_get_entity');
    expect(toolNames).toContain('sauria_search');
    expect(toolNames).toContain('sauria_get_upcoming');
    expect(toolNames).toContain('sauria_get_insights');
    expect(toolNames).toContain('sauria_get_context_for');
    expect(toolNames).toContain('sauria_add_event');
    expect(toolNames).toContain('sauria_remember');
  });

  it('registers 3 approval tool names when checkpointManager provided', async () => {
    const checkpointManager = {
      getPending: vi.fn(() => []),
      approve: vi.fn(() => []),
      reject: vi.fn(),
    };
    vi.mocked(registerTool).mockClear();
    await startMcpServer({
      db: mockDb,
      router: mockRouter,
      audit: mockAudit,
      checkpointManager: checkpointManager as never,
    });

    const toolNames = vi.mocked(registerTool).mock.calls.map((c) => c[1]);
    expect(toolNames).toContain('sauria_pending_approvals');
    expect(toolNames).toContain('sauria_approve');
    expect(toolNames).toContain('sauria_reject');
  });

  it('returns a McpServer instance', async () => {
    const server = await startMcpServer({ db: mockDb, router: mockRouter, audit: mockAudit });
    expect(server).toBeDefined();
    expect(server.connect).toBeDefined();
  });

  it('works with orchestrator provided in deps', async () => {
    const orchestrator = {
      executeApprovedActions: vi.fn().mockResolvedValue(2),
    };
    const checkpointManager = {
      getPending: vi.fn(() => []),
      approve: vi.fn(() => []),
      reject: vi.fn(),
    };
    vi.mocked(registerTool).mockClear();
    const server = await startMcpServer({
      db: mockDb,
      router: mockRouter,
      audit: mockAudit,
      checkpointManager: checkpointManager as never,
      orchestrator: orchestrator as never,
    });
    expect(server).toBeDefined();
    expect(registerTool).toHaveBeenCalledTimes(11);
  });
});

/* ------------------------------------------------------------------ */
/* Helper: extract the handler callback passed to registerTool by name */
/* ------------------------------------------------------------------ */
function getRegisteredHandler(toolName: string) {
  const calls = vi.mocked(registerTool).mock.calls;
  const match = calls.find((c) => c[1] === toolName);
  if (!match) throw new Error(`Handler for ${toolName} not found`);
  return match[4] as (args: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }> }>;
}

/* ------------------------------------------------------------------ */
/* Approval tool handler tests                                        */
/* ------------------------------------------------------------------ */
describe('approval tool handlers', () => {
  const checkpointManager = {
    getPending: vi.fn(() => []),
    approve: vi.fn(() => []),
    reject: vi.fn(),
  };
  const orchestrator = {
    executeApprovedActions: vi.fn().mockResolvedValue(2),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    checkpointManager.getPending.mockReturnValue([]);
    checkpointManager.approve.mockReturnValue([]);
    orchestrator.executeApprovedActions.mockResolvedValue(2);

    vi.mocked(registerTool).mockClear();
    await startMcpServer({
      db: mockDb,
      router: mockRouter,
      audit: mockAudit,
      checkpointManager: checkpointManager as never,
      orchestrator: orchestrator as never,
    });
  });

  describe('sauria_pending_approvals', () => {
    it('returns no pending approvals message when list is empty', async () => {
      checkpointManager.getPending.mockReturnValue([]);
      const handler = getRegisteredHandler('sauria_pending_approvals');
      const result = await handler({});
      expect(result.content[0].text).toBe('No pending approvals.');
    });

    it('formats pending approvals with actions', async () => {
      checkpointManager.getPending.mockReturnValue([
        {
          id: 'ap-1',
          agentId: 'agent-a',
          workspaceId: 'ws-1',
          description: 'Send email',
          actions: [{ type: 'reply' }],
          createdAt: '2026-03-10T00:00:00Z',
        },
      ]);
      const handler = getRegisteredHandler('sauria_pending_approvals');
      const result = await handler({});
      expect(result.content[0].text).toContain('[ap-1]');
      expect(result.content[0].text).toContain('Agent: agent-a');
      expect(result.content[0].text).toContain('Workspace: ws-1');
      expect(result.content[0].text).toContain('Send email');
      expect(result.content[0].text).toContain('reply');
    });

    it('formats actions with targetNodeId', async () => {
      checkpointManager.getPending.mockReturnValue([
        {
          id: 'ap-2',
          agentId: 'agent-b',
          workspaceId: 'ws-2',
          description: 'Forward task',
          actions: [{ type: 'forward', targetNodeId: 'node-x' }],
          createdAt: '2026-03-10T01:00:00Z',
        },
      ]);
      const handler = getRegisteredHandler('sauria_pending_approvals');
      const result = await handler({});
      expect(result.content[0].text).toContain('node-x');
    });

    it('formats multiple pending approvals', async () => {
      checkpointManager.getPending.mockReturnValue([
        {
          id: 'ap-1',
          agentId: 'agent-a',
          workspaceId: 'ws-1',
          description: 'Task 1',
          actions: [{ type: 'reply' }],
          createdAt: '2026-03-10T00:00:00Z',
        },
        {
          id: 'ap-2',
          agentId: 'agent-b',
          workspaceId: 'ws-1',
          description: 'Task 2',
          actions: [{ type: 'forward', targetNodeId: 'n1' }],
          createdAt: '2026-03-10T01:00:00Z',
        },
      ]);
      const handler = getRegisteredHandler('sauria_pending_approvals');
      const result = await handler({});
      expect(result.content[0].text).toContain('[ap-1]');
      expect(result.content[0].text).toContain('[ap-2]');
    });
  });

  describe('sauria_approve', () => {
    it('approves and executes actions with orchestrator', async () => {
      checkpointManager.getPending.mockReturnValue([
        { id: 'ap-1', agentId: 'agent-a' },
      ]);
      checkpointManager.approve.mockReturnValue([{ type: 'reply' }]);
      orchestrator.executeApprovedActions.mockResolvedValue(1);

      const handler = getRegisteredHandler('sauria_approve');
      const result = await handler({ approvalId: 'ap-1' });
      expect(result.content[0].text).toBe('Approved and executed 1 action(s).');
      expect(orchestrator.executeApprovedActions).toHaveBeenCalledWith('agent-a', [{ type: 'reply' }]);
      expect(mockAudit.logAction).toHaveBeenCalledWith('mcp:approval_approved', {
        approvalId: 'ap-1',
        actionCount: 1,
      });
    });

    it('returns no-orchestrator message when actions exist but no orchestrator', async () => {
      vi.mocked(registerTool).mockClear();
      await startMcpServer({
        db: mockDb,
        router: mockRouter,
        audit: mockAudit,
        checkpointManager: checkpointManager as never,
        // no orchestrator
      });

      checkpointManager.getPending.mockReturnValue([
        { id: 'ap-1', agentId: 'agent-a' },
      ]);
      checkpointManager.approve.mockReturnValue([{ type: 'reply' }]);

      const handler = getRegisteredHandler('sauria_approve');
      const result = await handler({ approvalId: 'ap-1' });
      expect(result.content[0].text).toBe('Approved 1 action(s). No orchestrator to execute them.');
    });

    it('returns no-orchestrator message when approve returns empty actions', async () => {
      checkpointManager.getPending.mockReturnValue([
        { id: 'ap-1', agentId: 'agent-a' },
      ]);
      checkpointManager.approve.mockReturnValue([]);

      const handler = getRegisteredHandler('sauria_approve');
      const result = await handler({ approvalId: 'ap-1' });
      expect(result.content[0].text).toBe('Approved 0 action(s). No orchestrator to execute them.');
      expect(orchestrator.executeApprovedActions).not.toHaveBeenCalled();
    });

    it('uses empty agentId when approval not found in pending', async () => {
      checkpointManager.getPending.mockReturnValue([]);
      checkpointManager.approve.mockReturnValue([{ type: 'reply' }]);
      orchestrator.executeApprovedActions.mockResolvedValue(1);

      const handler = getRegisteredHandler('sauria_approve');
      const result = await handler({ approvalId: 'ap-unknown' });
      expect(result.content[0].text).toBe('Approved and executed 1 action(s).');
      expect(orchestrator.executeApprovedActions).toHaveBeenCalledWith('', [{ type: 'reply' }]);
    });
  });

  describe('sauria_reject', () => {
    it('rejects an approval', async () => {
      const handler = getRegisteredHandler('sauria_reject');
      const result = await handler({ approvalId: 'ap-1' });
      expect(result.content[0].text).toBe('Approval ap-1 rejected.');
      expect(checkpointManager.reject).toHaveBeenCalledWith('ap-1');
      expect(mockAudit.logAction).toHaveBeenCalledWith('mcp:approval_rejected', { approvalId: 'ap-1' });
    });
  });
});

/* ------------------------------------------------------------------ */
/* Rate limit and audit internal function tests                       */
/* ------------------------------------------------------------------ */
describe('guardRateLimit and auditToolCall via approval handlers', () => {
  it('throws when rate limit is exceeded', async () => {
    const { createLimiter } = await import('../../security/rate-limiter.js');
    vi.mocked(createLimiter).mockReturnValue({ tryConsume: vi.fn(() => false) } as never);

    const checkpointManager = {
      getPending: vi.fn(() => []),
      approve: vi.fn(() => []),
      reject: vi.fn(),
    };

    vi.mocked(registerTool).mockClear();
    await startMcpServer({
      db: mockDb,
      router: mockRouter,
      audit: mockAudit,
      checkpointManager: checkpointManager as never,
    });

    const handler = getRegisteredHandler('sauria_pending_approvals');
    await expect(handler({})).rejects.toThrow('Rate limit exceeded. Try again later.');
    expect(mockAudit.logAction).toHaveBeenCalledWith(
      'mcp:rate_limited',
      { tool: 'sauria_pending_approvals' },
      { success: false },
    );

    // Restore limiter for other tests
    vi.mocked(createLimiter).mockReturnValue({ tryConsume: vi.fn(() => true) } as never);
  });

  it('auditToolCall passes undefined hash for non-object params', async () => {
    const { validateToolInput } = await import('../tools.js');
    // Make validateToolInput return a non-object (string) so auditToolCall gets non-object
    vi.mocked(validateToolInput).mockReturnValueOnce('plain-string' as never);

    const checkpointManager = {
      getPending: vi.fn(() => []),
      approve: vi.fn(() => []),
      reject: vi.fn(),
    };

    vi.mocked(registerTool).mockClear();
    await startMcpServer({
      db: mockDb,
      router: mockRouter,
      audit: mockAudit,
      checkpointManager: checkpointManager as never,
    });

    // The reject handler passes raw (which we control) to auditToolCall
    // Pass null as raw to trigger the non-object branch
    const handler = getRegisteredHandler('sauria_reject');
    // validateToolInput is mocked to return the input, so pass null
    await handler(null as never);

    // auditToolCall should have been called with hash = undefined
    expect(mockAudit.logAction).toHaveBeenCalledWith(
      'mcp:tool_call',
      { tool: 'sauria_reject' },
      { promptHash: undefined },
    );
  });

  it('auditToolCall hashes object params', async () => {
    const checkpointManager = {
      getPending: vi.fn(() => []),
      approve: vi.fn(() => []),
      reject: vi.fn(),
    };

    vi.mocked(registerTool).mockClear();
    await startMcpServer({
      db: mockDb,
      router: mockRouter,
      audit: mockAudit,
      checkpointManager: checkpointManager as never,
    });

    // The pending_approvals handler calls auditToolCall with the raw params (an object)
    const handler = getRegisteredHandler('sauria_pending_approvals');
    await handler({ someKey: 'someValue' });

    expect(mockAudit.hashContent).toHaveBeenCalled();
    expect(mockAudit.logAction).toHaveBeenCalledWith(
      'mcp:tool_call',
      { tool: 'sauria_pending_approvals' },
      { promptHash: 'hash' },
    );
  });
});
