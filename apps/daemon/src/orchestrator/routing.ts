import type { AgentNode, Edge, InboundMessage, RoutingAction } from './types.js';

export function evaluateEdgeRules(
  sourceNode: AgentNode,
  message: InboundMessage,
  edges: readonly Edge[],
): RoutingAction[] {
  const outgoing = edges.filter((e) => e.from === sourceNode.id);
  const actions: RoutingAction[] = [];

  for (const edge of outgoing) {
    for (const rule of edge.rules) {
      if (rule.type === 'llm_decided') continue;

      if (rule.type === 'always') {
        actions.push(buildAction(rule.action, edge.to, message.content));
        continue;
      }

      if (rule.type === 'keyword' && rule.condition) {
        const lowerContent = message.content.toLowerCase();
        const lowerCondition = rule.condition.toLowerCase();
        if (lowerContent.includes(lowerCondition)) {
          actions.push(buildAction(rule.action, edge.to, message.content));
        }
        continue;
      }

      if (rule.type === 'priority' && rule.condition) {
        // Priority rules checked against message metadata (future extension)
        continue;
      }
    }
  }

  return actions;
}

function buildAction(action: string, targetNodeId: string, content: string): RoutingAction {
  switch (action) {
    case 'forward':
      return { type: 'forward', targetNodeId, content };
    case 'assign':
      return { type: 'assign', targetNodeId, task: content, priority: 'normal' };
    case 'notify':
      return { type: 'notify', targetNodeId, summary: content };
    case 'send_to_all':
      return { type: 'send_to_all', workspaceId: targetNodeId, content };
    default:
      return { type: 'forward', targetNodeId, content };
  }
}
