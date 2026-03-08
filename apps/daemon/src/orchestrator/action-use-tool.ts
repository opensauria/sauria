import type { InboundMessage, RoutingAction } from './types.js';
import { getLogger } from '../utils/logger.js';
import { resolveInstanceId } from './orchestrator-helpers.js';
import type { ActionContext } from './action-executor.js';
import { executeAction } from './action-executor.js';

export async function handleUseTool(
  action: Extract<RoutingAction, { readonly type: 'use_tool' }>,
  source: InboundMessage,
  ctx: ActionContext,
): Promise<void> {
  const logger = getLogger();

  if (!ctx.integrationRegistry) {
    logger.warn('use_tool action received but no integration registry available');
    return;
  }

  const sourceNode = ctx.findNode(source.sourceNodeId);
  let resolvedIntegration = action.integration;
  if (sourceNode?.integrations && sourceNode.integrations.length > 0) {
    const matched = resolveInstanceId(ctx.graph, resolvedIntegration, sourceNode.integrations);
    if (!matched) {
      logger.warn('use_tool blocked: instance not assigned to agent', {
        nodeId: source.sourceNodeId,
        integration: resolvedIntegration,
        assignedInstances: [...sourceNode.integrations],
      });
      return;
    }
    resolvedIntegration = matched;
  }

  try {
    logger.info('use_tool: calling', {
      integration: resolvedIntegration,
      tool: action.tool,
      args: Object.keys(action.arguments),
    });
    const result = await ctx.integrationRegistry.callTool(resolvedIntegration, action.tool, {
      ...action.arguments,
    });
    const rawResult = typeof result === 'string' ? result : JSON.stringify(result);
    logger.info('use_tool: result received', {
      integration: resolvedIntegration,
      tool: action.tool,
      resultLength: rawResult.length,
    });

    const nodeForLabel = ctx.findNode(source.sourceNodeId);
    let replyContent: string;
    if (ctx.brain) {
      replyContent = await ctx.brain.summarizeToolResult(
        nodeForLabel?.label ?? 'Agent',
        source.content,
        action.tool,
        rawResult.slice(0, 4000),
      );
    } else {
      replyContent = `${action.content}\n\n${rawResult.slice(0, 500)}`;
    }
    await executeAction({ type: 'reply', content: replyContent }, source, ctx);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error('use_tool: failed', {
      integration: resolvedIntegration,
      tool: action.tool,
      error: errorMsg,
    });
    const replyContent = `${action.content}\n\nTool error: ${errorMsg}`;
    await executeAction({ type: 'reply', content: replyContent }, source, ctx);
  }
}
