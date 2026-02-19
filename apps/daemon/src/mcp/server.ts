import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type BetterSqlite3 from 'better-sqlite3';
import { nanoid } from 'nanoid';
import type { ModelRouter } from '../ai/router.js';
import { reasonAbout } from '../ai/reason.js';
import type { AuditLogger } from '../security/audit.js';
import { createLimiter, SECURITY_LIMITS } from '../security/rate-limiter.js';
import {
  getEntityByName,
  getEntityRelations,
  getEntityTimeline,
  recordEvent,
  searchEntities,
  upsertEntity,
  upsertRelation,
} from '../db/world-model.js';
import { resolveEntity } from '../ingestion/resolver.js';
import { getUpcomingDeadlines } from '../db/temporal.js';
import { hybridSearch } from '../db/search.js';
import { TOOL_DEFS, validateToolInput } from './tools.js';
import type { ToolName } from './tools.js';
import { registerTool, textResult, formatEntity, isObservationRow } from './server-helpers.js';

interface McpServerDeps {
  readonly db: BetterSqlite3.Database;
  readonly router: ModelRouter;
  readonly audit: AuditLogger;
  readonly checkpointManager?: import('../orchestrator/checkpoint.js').CheckpointManager;
  readonly orchestrator?: import('../orchestrator/orchestrator.js').AgentOrchestrator;
}

export async function startMcpServer(deps: McpServerDeps): Promise<McpServer> {
  const { db, router, audit } = deps;
  const server = new McpServer({ name: 'opensauria', version: '0.1.0' });
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

  registerTool(
    server,
    'opensauria_query',
    TOOL_DEFS.opensauria_query.description,
    TOOL_DEFS.opensauria_query.schema.shape,
    async (raw) => {
      guardRateLimit('opensauria_query');
      const { query } = validateToolInput('opensauria_query', raw);
      auditToolCall('opensauria_query', raw);
      const entities = searchEntities(db, query);
      const context = entities.map(formatEntity).join('\n\n');
      return textResult(await reasonAbout(router, context, query));
    },
  );

  registerTool(
    server,
    'opensauria_get_entity',
    TOOL_DEFS.opensauria_get_entity.description,
    TOOL_DEFS.opensauria_get_entity.schema.shape,
    async (raw) => {
      guardRateLimit('opensauria_get_entity');
      const { name } = validateToolInput('opensauria_get_entity', raw);
      auditToolCall('opensauria_get_entity', raw);
      const entity = getEntityByName(db, name);
      if (!entity) return textResult(`Entity "${name}" not found.`);
      const relations = getEntityRelations(db, entity.id);
      const timeline = getEntityTimeline(db, entity.id, 20);
      const relLines = relations.map((r) => {
        const isSource = r.fromEntityId === entity.id;
        return `  ${isSource ? '->' : '<-'} [${r.type}] ${isSource ? r.toEntityId : r.fromEntityId} (strength: ${r.strength})`;
      });
      const eventLines = timeline.map((e) => `  [${e.timestamp}] ${e.eventType}: ${e.source}`);
      const output = [
        formatEntity(entity),
        relations.length > 0 ? `\nRelations:\n${relLines.join('\n')}` : '',
        timeline.length > 0 ? `\nTimeline:\n${eventLines.join('\n')}` : '',
      ]
        .filter(Boolean)
        .join('\n');
      return textResult(output);
    },
  );

  registerTool(
    server,
    'opensauria_search',
    TOOL_DEFS.opensauria_search.description,
    TOOL_DEFS.opensauria_search.schema.shape,
    async (raw) => {
      guardRateLimit('opensauria_search');
      const { query, limit } = validateToolInput('opensauria_search', raw);
      auditToolCall('opensauria_search', raw);
      const results = hybridSearch(db, query, null, limit);
      if (results.length === 0) return textResult('No results found.');
      return textResult(results.map((e, i) => `${i + 1}. ${formatEntity(e)}`).join('\n\n'));
    },
  );

  registerTool(
    server,
    'opensauria_get_upcoming',
    TOOL_DEFS.opensauria_get_upcoming.description,
    TOOL_DEFS.opensauria_get_upcoming.schema.shape,
    async (raw) => {
      guardRateLimit('opensauria_get_upcoming');
      const { hours } = validateToolInput('opensauria_get_upcoming', raw);
      auditToolCall('opensauria_get_upcoming', raw);
      const events = getUpcomingDeadlines(db, hours);
      if (events.length === 0) return textResult(`No upcoming events in the next ${hours} hours.`);
      const lines = events.map(
        (e) => `[${e.timestamp}] ${e.eventType} (${e.source}) - importance: ${e.importance}`,
      );
      return textResult(lines.join('\n'));
    },
  );

  registerTool(
    server,
    'opensauria_get_insights',
    TOOL_DEFS.opensauria_get_insights.description,
    TOOL_DEFS.opensauria_get_insights.schema.shape,
    async (raw) => {
      guardRateLimit('opensauria_get_insights');
      const { entityName, limit } = validateToolInput('opensauria_get_insights', raw);
      auditToolCall('opensauria_get_insights', raw);
      let rows: unknown[];
      if (entityName) {
        const entity = getEntityByName(db, entityName);
        if (!entity) return textResult(`Entity "${entityName}" not found.`);
        rows = db
          .prepare(
            "SELECT o.* FROM observations o, json_each(o.entity_ids) j WHERE o.type = 'insight' AND j.value = ? ORDER BY o.created_at DESC LIMIT ?",
          )
          .all(entity.id, limit);
        if (rows.length === 0) {
          rows = db
            .prepare(
              "SELECT * FROM observations WHERE type = 'insight' ORDER BY created_at DESC LIMIT ?",
            )
            .all(limit);
        }
      } else {
        rows = db
          .prepare(
            "SELECT * FROM observations WHERE type = 'insight' ORDER BY created_at DESC LIMIT ?",
          )
          .all(limit);
      }
      if (rows.length === 0) return textResult('No insights generated yet.');
      const lines = rows
        .filter(isObservationRow)
        .map(
          (r) =>
            `[${String(r['created_at'])}] (confidence: ${String(r['confidence'])}) ${String(r['content'])}`,
        );
      return textResult(lines.join('\n\n'));
    },
  );

  registerTool(
    server,
    'opensauria_get_context_for',
    TOOL_DEFS.opensauria_get_context_for.description,
    TOOL_DEFS.opensauria_get_context_for.schema.shape,
    async (raw) => {
      guardRateLimit('opensauria_get_context_for');
      const { topic } = validateToolInput('opensauria_get_context_for', raw);
      auditToolCall('opensauria_get_context_for', raw);
      const entities = hybridSearch(db, topic, null, 10);
      const sections: string[] = [`Context for: ${topic}\n`];
      for (const entity of entities) {
        sections.push(formatEntity(entity));
        const relations = getEntityRelations(db, entity.id);
        if (relations.length > 0) {
          sections.push('Relations:');
          for (const r of relations.slice(0, 10)) {
            sections.push(
              `  [${r.type}] ${r.fromEntityId} -> ${r.toEntityId} (strength: ${r.strength})`,
            );
          }
        }
        const timeline = getEntityTimeline(db, entity.id, 5);
        if (timeline.length > 0) {
          sections.push('Recent events:');
          for (const e of timeline) {
            sections.push(`  [${e.timestamp}] ${e.eventType}: ${e.source}`);
          }
        }
        sections.push('');
      }
      if (entities.length === 0) sections.push('No matching entities found.');
      return textResult(sections.join('\n'));
    },
  );

  registerTool(
    server,
    'opensauria_add_event',
    TOOL_DEFS.opensauria_add_event.description,
    TOOL_DEFS.opensauria_add_event.schema.shape,
    async (raw) => {
      guardRateLimit('opensauria_add_event');
      const input = validateToolInput('opensauria_add_event', raw);
      auditToolCall('opensauria_add_event', raw);
      const eventId = nanoid();
      const contentHash = audit.hashContent(input.content);
      const entityIds = input.entityNames
        ?.map((n) => getEntityByName(db, n)?.id)
        .filter((id): id is string => id !== undefined);
      recordEvent(db, {
        id: eventId,
        source: input.sourceType,
        eventType: input.eventType,
        contentHash,
        parsedData: { title: input.title, content: input.content },
        entityIds,
        timestamp: input.timestamp ?? new Date().toISOString(),
      });
      return textResult(`Event recorded: ${eventId}`);
    },
  );

  registerTool(
    server,
    'opensauria_remember',
    TOOL_DEFS.opensauria_remember.description,
    TOOL_DEFS.opensauria_remember.schema.shape,
    async (raw) => {
      guardRateLimit('opensauria_remember');
      const { entities, relations } = validateToolInput('opensauria_remember', raw);
      auditToolCall('opensauria_remember', raw);

      const entityIdMap = new Map<string, string>();

      for (const entity of entities) {
        const id = resolveEntity(db, {
          name: entity.name,
          type: entity.type,
          properties: entity.properties,
        });
        entityIdMap.set(entity.name, id);
        upsertEntity(db, {
          id,
          type: entity.type,
          name: entity.name,
          summary: entity.summary,
          properties: entity.properties,
        });
      }

      let relCount = 0;
      for (const rel of relations) {
        const fromId = entityIdMap.get(rel.from);
        const toId = entityIdMap.get(rel.to);
        if (!fromId || !toId) continue;
        upsertRelation(db, {
          id: nanoid(),
          fromEntityId: fromId,
          toEntityId: toId,
          type: rel.type,
          context: rel.context,
        });
        relCount++;
      }

      return textResult(
        `Remembered ${entities.length} entit${entities.length === 1 ? 'y' : 'ies'}` +
          (relCount > 0 ? ` and ${relCount} relation${relCount === 1 ? '' : 's'}` : '') +
          '.',
      );
    },
  );

  // ─── Approval tools (only if checkpoint manager is available) ─────────

  if (deps.checkpointManager) {
    const cm = deps.checkpointManager;

    registerTool(
      server,
      'opensauria_pending_approvals',
      TOOL_DEFS.opensauria_pending_approvals.description,
      TOOL_DEFS.opensauria_pending_approvals.schema.shape,
      async (raw) => {
        guardRateLimit('opensauria_pending_approvals');
        validateToolInput('opensauria_pending_approvals', raw);
        auditToolCall('opensauria_pending_approvals', raw);

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
      'opensauria_approve',
      TOOL_DEFS.opensauria_approve.description,
      TOOL_DEFS.opensauria_approve.schema.shape,
      async (raw) => {
        guardRateLimit('opensauria_approve');
        const { approvalId } = validateToolInput('opensauria_approve', raw);
        auditToolCall('opensauria_approve', raw);

        // Get agent ID before approving (approve changes status)
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
      'opensauria_reject',
      TOOL_DEFS.opensauria_reject.description,
      TOOL_DEFS.opensauria_reject.schema.shape,
      async (raw) => {
        guardRateLimit('opensauria_reject');
        const { approvalId } = validateToolInput('opensauria_reject', raw);
        auditToolCall('opensauria_reject', raw);

        cm.reject(approvalId);
        audit.logAction('mcp:approval_rejected', { approvalId });
        return textResult(`Approval ${approvalId} rejected.`);
      },
    );
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  return server;
}
