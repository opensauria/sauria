import type { AgentMemory } from './agent-memory.js';
import type { AgentNode, CanvasGraph, InboundMessage, OwnerIdentity, Platform } from './types.js';

export interface HelperDeps {
  readonly graph: CanvasGraph;
  readonly agentMemory: AgentMemory | null;
  readonly ownerIdentity: OwnerIdentity;
  findNode(nodeId: string): AgentNode | null;
}

export function recordReplyInMemory(
  deps: HelperDeps,
  source: InboundMessage,
  content: string,
): void {
  if (!deps.agentMemory) return;
  const conversationId = deps.agentMemory.getOrCreateConversation(source.platform, source.groupId, [
    source.sourceNodeId,
  ]);
  deps.agentMemory.recordMessage({
    conversationId,
    sourceNodeId: source.sourceNodeId,
    senderId: source.sourceNodeId,
    senderIsOwner: false,
    platform: source.platform,
    groupId: source.groupId,
    content,
    contentType: 'text',
  });
}

export function contentPreview(content: string): string {
  return content.length > 60 ? content.slice(0, 57) + '...' : content;
}

export function buildForwardContext(
  deps: HelperDeps,
  sourceNodeId: string,
  platform: string,
  groupId: string | null,
): string {
  if (!deps.agentMemory) return '';

  const sourceNode = deps.findNode(sourceNodeId);
  if (!sourceNode) return '';

  const conversationId = deps.agentMemory.getOrCreateConversation(platform, groupId, [
    sourceNodeId,
  ]);

  const nodeLabels = new Map(deps.graph.nodes.map((n) => [n.id, n.label]));
  const recentMessages = deps.agentMemory.getRecentMessagesForContext(
    conversationId,
    5,
    nodeLabels,
  );

  if (recentMessages.length === 0) return '';

  return [
    `[Forwarded from ${sourceNode.label}]`,
    '[Recent context]:',
    ...recentMessages.map((m) => `- ${m}`),
    '',
    '[Message]:',
  ].join('\n');
}

export function resolveInstanceId(
  graph: CanvasGraph,
  ref: string,
  assignedIds: readonly string[],
): string | null {
  for (const iid of assignedIds) {
    if (iid === ref) return iid;
    if (iid.startsWith(ref + ':')) return iid;
    const inst = (graph.instances ?? []).find((i) => i.id === iid);
    if (!inst) continue;
    if (inst.integrationId === ref) return iid;
    if (inst.label.toLowerCase() === ref.toLowerCase()) return iid;
  }
  return null;
}

export function findGroupForNode(deps: HelperDeps): (nodeId: string) => string | null {
  return (nodeId: string): string | null => {
    const node = deps.findNode(nodeId);
    if (!node?.workspaceId) return null;
    const workspace = deps.graph.workspaces.find((w) => w.id === node.workspaceId);
    if (!workspace) return null;
    const group = workspace.groups.find((g) => g.platform === node.platform);
    return group?.groupId ?? null;
  };
}

export function isOwnerChannelNode(ownerIdentity: OwnerIdentity, node: AgentNode): boolean {
  if (node.platform === 'telegram' && ownerIdentity.telegram) return true;
  if (node.platform === 'slack' && ownerIdentity.slack) return true;
  if (node.platform === 'whatsapp' && ownerIdentity.whatsapp) return true;
  return false;
}

export function isOwnerSender(
  ownerIdentity: OwnerIdentity,
  platform: Platform,
  senderId: string,
): boolean {
  if (platform === 'telegram' && ownerIdentity.telegram) {
    return String(ownerIdentity.telegram.userId) === senderId;
  }
  if (platform === 'slack' && ownerIdentity.slack) {
    return ownerIdentity.slack.userId === senderId;
  }
  if (platform === 'whatsapp' && ownerIdentity.whatsapp) {
    return ownerIdentity.whatsapp.phoneNumber === senderId;
  }
  return false;
}
