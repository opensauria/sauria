import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type BetterSqlite3 from 'better-sqlite3';
import type { ModelRouter } from '../ai/router.js';
import type { AuditLogger } from '../security/audit.js';
import { createLimiter, SECURITY_LIMITS } from '../security/rate-limiter.js';
import { TOOL_DEFS, validateToolInput } from './tools.js';
import type { ToolName } from './tools.js';
import { registerTool, textResult } from './server-helpers.js';
import {
  createQueryHandler,
  createGetEntityHandler,
  createSearchHandler,
  createUpcomingHandler,
  createInsightsHandler,
  createContextHandler,
} from './server-tools.js';
import { createAddEventHandler, createRememberHandler } from './server-tools-write.js';

interface McpServerDeps {
  readonly db: BetterSqlite3.Database;
  readonly router: ModelRouter;
  readonly audit: AuditLogger;
  readonly checkpointManager?: import('../orchestrator/checkpoint.js').CheckpointManager;
  readonly orchestrator?: import('../orchestrator/orchestrator.js').AgentOrchestrator;
}

export async function startMcpServer(deps: McpServerDeps): Promise<McpServer> {
  const { db, router, audit } = deps;
  const server = new McpServer({ name: 'sauria', version: '0.1.0' });
  const limiter = createLimiter('mcp', SECURITY_LIMITS.mcp.maxQueriesPerMinute, 60_000);

  function guardRateLimit(toolName: ToolName): void {
    if (!limiter.tryConsume()) {
      audit.logAction('mcp:rate_limited', { tool: toolName }, { success: false });
      throw new Error('Rate limit exceeded. Try again later.');
    }
  }

  function auditToolCall(toolName: ToolName, params: unknown): void {
    const hash =
      typeof params === 'object' && params !== null
        ? audit.hashContent(JSON.stringify(params))
        : undefined;
    audit.logAction('mcp:tool_call', { tool: toolName }, { promptHash: hash });
  }

  const toolDeps = { db, router, audit, guardRateLimit, auditToolCall };

  const tools: readonly [ToolName, ReturnType<typeof createQueryHandler>][] = [
    ['sauria_query', createQueryHandler(toolDeps)],
    ['sauria_get_entity', createGetEntityHandler(toolDeps)],
    ['sauria_search', createSearchHandler(toolDeps)],
    ['sauria_get_upcoming', createUpcomingHandler(toolDeps)],
    ['sauria_get_insights', createInsightsHandler(toolDeps)],
    ['sauria_get_context_for', createContextHandler(toolDeps)],
    ['sauria_add_event', createAddEventHandler(toolDeps)],
    ['sauria_remember', createRememberHandler(toolDeps)],
  ];

  for (const [name, handler] of tools) {
    registerTool(server, name, TOOL_DEFS[name].description, TOOL_DEFS[name].schema.shape, handler);
  }

  registerApprovalTools(server, deps, guardRateLimit, auditToolCall);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  return server;
}

function registerApprovalTools(
  server: McpServer,
  deps: McpServerDeps,
  guardRateLimit: (toolName: ToolName) => void,
  auditToolCall: (toolName: ToolName, params: unknown) => void,
): void {
  if (!deps.checkpointManager) return;

  const { audit } = deps;
  const cm = deps.checkpointManager;

  registerTool(
    server,
    'sauria_pending_approvals',
    TOOL_DEFS.sauria_pending_approvals.description,
    TOOL_DEFS.sauria_pending_approvals.schema.shape,
    async (raw) => {
      guardRateLimit('sauria_pending_approvals');
      validateToolInput('sauria_pending_approvals', raw);
      auditToolCall('sauria_pending_approvals', raw);

      const pending = cm.getPending();
      if (pending.length === 0) return textResult('No pending approvals.');

      const lines = pending.map((p) => {
        const actionSummary = p.actions
          .map(
            (a) =>
              `  - ${a.type}${'targetNodeId' in a ? ` → ${(a as Record<string, unknown>).targetNodeId}` : ''}`,
          )
          .join('\n');
        return `[${p.id}] Agent: ${p.agentId} | Workspace: ${p.workspaceId}\n${p.description}\nActions:\n${actionSummary}\nCreated: ${p.createdAt}`;
      });
      return textResult(lines.join('\n\n'));
    },
  );

  registerTool(
    server,
    'sauria_approve',
    TOOL_DEFS.sauria_approve.description,
    TOOL_DEFS.sauria_approve.schema.shape,
    async (raw) => {
      guardRateLimit('sauria_approve');
      const { approvalId } = validateToolInput('sauria_approve', raw);
      auditToolCall('sauria_approve', raw);

      const pendingList = cm.getPending();
      const approval = pendingList.find((p) => p.id === approvalId);
      const agentId = approval?.agentId ?? '';

      const actions = cm.approve(approvalId);
      audit.logAction('mcp:approval_approved', { approvalId, actionCount: actions.length });

      if (deps.orchestrator && actions.length > 0) {
        const executed = await deps.orchestrator.executeApprovedActions(agentId, actions);
        return textResult(`Approved and executed ${String(executed)} action(s).`);
      }

      return textResult(
        `Approved ${String(actions.length)} action(s). No orchestrator to execute them.`,
      );
    },
  );

  registerTool(
    server,
    'sauria_reject',
    TOOL_DEFS.sauria_reject.description,
    TOOL_DEFS.sauria_reject.schema.shape,
    async (raw) => {
      guardRateLimit('sauria_reject');
      const { approvalId } = validateToolInput('sauria_reject', raw);
      auditToolCall('sauria_reject', raw);

      cm.reject(approvalId);
      audit.logAction('mcp:approval_rejected', { approvalId });
      return textResult(`Approval ${approvalId} rejected.`);
    },
  );
}
