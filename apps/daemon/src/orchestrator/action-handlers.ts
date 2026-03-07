import type { InboundMessage, RoutingAction } from './types.js';
import {
  contentPreview,
  buildForwardContext,
  recordReplyInMemory,
} from './orchestrator-helpers.js';
import type { ActionContext } from './action-executor.js';
import { handleUseTool } from './action-use-tool.js';
import { handleAssign } from './action-assign.js';

export { handleUseTool, handleAssign };

function createSyntheticMessage(
  targetNodeId: string,
  source: InboundMessage,
  content: string,
  incrementDepth: boolean,
): InboundMessage {
  return {
    sourceNodeId: targetNodeId,
    platform: source.platform,
    senderId: source.sourceNodeId,
    senderIsOwner: false,
    groupId: source.groupId,
    content,
    contentType: 'text',
    timestamp: new Date().toISOString(),
    forwardDepth: incrementDepth ? (source.forwardDepth ?? 0) + 1 : (source.forwardDepth ?? 0),
    replyToNodeId: source.replyToNodeId ?? source.sourceNodeId,
  };
}

export async function handleForward(
  action: Extract<RoutingAction, { readonly type: 'forward' }>,
  source: InboundMessage,
  ctx: ActionContext,
): Promise<void> {
  const contextPrefix = buildForwardContext(
    ctx.helperDeps,
    source.sourceNodeId,
    source.platform,
    source.groupId,
  );
  const enrichedContent = contextPrefix ? `${contextPrefix}\n${action.content}` : action.content;
  const syntheticFwd = createSyntheticMessage(action.targetNodeId, source, enrichedContent, true);

  ctx.emitEdge(source.sourceNodeId, action.targetNodeId, 'forward', contentPreview(action.content));
  ctx.emitMessage(source.sourceNodeId, action.targetNodeId, action.content, 'forward');
  await ctx.handleInbound(syntheticFwd);
}

export async function handleNotify(
  action: Extract<RoutingAction, { readonly type: 'notify' }>,
  source: InboundMessage,
  ctx: ActionContext,
): Promise<void> {
  const contextPrefix = buildForwardContext(
    ctx.helperDeps,
    source.sourceNodeId,
    source.platform,
    source.groupId,
  );
  const enrichedSummary = contextPrefix ? `${contextPrefix}\n${action.summary}` : action.summary;
  const syntheticNotify = createSyntheticMessage(
    action.targetNodeId,
    source,
    enrichedSummary,
    true,
  );

  ctx.emitEdge(source.sourceNodeId, action.targetNodeId, 'notify', contentPreview(action.summary));
  ctx.emitMessage(source.sourceNodeId, action.targetNodeId, action.summary, 'notify');
  await ctx.handleInbound(syntheticNotify);
}

async function broadcastToWorkspace(
  source: InboundMessage,
  ctx: ActionContext,
  workspaceId: string,
  content: string,
  actionType: string,
): Promise<void> {
  const wsNodes = ctx.graph.nodes.filter((n) => n.workspaceId === workspaceId);
  for (const target of wsNodes) {
    if (target.id === source.sourceNodeId) continue;
    const syntheticMsg = createSyntheticMessage(target.id, source, content, true);
    ctx.emitEdge(source.sourceNodeId, target.id, actionType, contentPreview(content));
    ctx.emitMessage(source.sourceNodeId, target.id, content, actionType);
    await ctx.handleInbound(syntheticMsg);
  }
}

export async function handleSendToAll(
  action: Extract<RoutingAction, { readonly type: 'send_to_all' }>,
  source: InboundMessage,
  ctx: ActionContext,
): Promise<void> {
  await broadcastToWorkspace(source, ctx, action.workspaceId, action.content, 'send_to_all');
}

export async function handleGroupMessage(
  action: Extract<RoutingAction, { readonly type: 'group_message' }>,
  source: InboundMessage,
  ctx: ActionContext,
): Promise<void> {
  await broadcastToWorkspace(source, ctx, action.workspaceId, action.content, 'group_message');
}

export async function handleReply(
  action: Extract<RoutingAction, { readonly type: 'reply' }>,
  source: InboundMessage,
  ctx: ActionContext,
): Promise<void> {
  const replyTargetId = source.replyToNodeId ?? source.sourceNodeId;
  const isForwardedReply = (source.forwardDepth ?? 0) > 0 && replyTargetId !== source.sourceNodeId;

  recordReplyInMemory(ctx.helperDeps, source, action.content);

  if (isForwardedReply) {
    const sourceLabel = ctx.findNode(source.sourceNodeId)?.label ?? source.sourceNodeId;
    const enrichedContent = `[Reply from ${sourceLabel}]\n${action.content}`;
    const syntheticReply: InboundMessage = {
      sourceNodeId: replyTargetId,
      platform: source.platform,
      senderId: source.sourceNodeId,
      senderIsOwner: false,
      groupId: source.groupId,
      content: enrichedContent,
      contentType: 'text',
      timestamp: new Date().toISOString(),
      forwardDepth: source.forwardDepth ?? 0,
      replyToNodeId: source.replyToNodeId,
    };
    ctx.emitEdge(source.sourceNodeId, replyTargetId, 'reply', contentPreview(action.content));
    ctx.emitMessage(source.sourceNodeId, replyTargetId, action.content, 'reply');
    await ctx.handleInbound(syntheticReply);
  } else {
    await ctx.registry.sendTo(source.sourceNodeId, action.content, source.groupId);
    ctx.emitEdge(source.sourceNodeId, source.sourceNodeId, 'reply', contentPreview(action.content));
    ctx.emitMessage(source.sourceNodeId, source.sourceNodeId, action.content, 'reply');
  }
}
