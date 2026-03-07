import type { InboundMessage, AgentNode } from './types.js';

// ─── Forward Content Parser ──────────────────────────────────────────

interface ParsedForward {
  readonly senderLabel: string;
  readonly context: readonly string[];
  readonly actualMessage: string;
}

export function parseForwardedContent(content: string): ParsedForward | null {
  const senderMatch = content.match(/^\[(?:Forwarded|Reply) from ([^\]]+)\]\s*/);
  if (!senderMatch) return null;

  const messageMarker = content.indexOf('\n[Message]:\n');
  if (messageMarker === -1) {
    return { senderLabel: senderMatch[1]!, context: [], actualMessage: content };
  }

  const contextBlock = content.slice(senderMatch[0].length, messageMarker);
  const contextLines = contextBlock
    .split('\n')
    .filter((l) => l.startsWith('- '))
    .map((l) => l.slice(2));

  const actualMessage = content.slice(messageMarker + '\n[Message]:\n'.length).trim();

  return { senderLabel: senderMatch[1]!, context: contextLines, actualMessage };
}

export function buildMessageSection(message: InboundMessage, sourceNode: AgentNode): string[] {
  const isForwarded = (message.forwardDepth ?? 0) > 0;

  if (!isForwarded) {
    return [
      `Incoming message from ${sourceNode.label} (${sourceNode.role}):`,
      `"${message.content}"`,
    ];
  }

  const parsed = parseForwardedContent(message.content);
  const isReply = message.content.startsWith('[Reply from ');

  if (!parsed) {
    const verb = isReply ? 'a reply' : 'a forwarded message';
    return [`${sourceNode.label} (${sourceNode.role}) received ${verb}:`, `"${message.content}"`];
  }

  const verb = isReply ? 'a reply from' : 'a message forwarded by';
  const lines: string[] = [
    `${sourceNode.label} (${sourceNode.role}) received ${verb} ${parsed.senderLabel}.`,
  ];

  if (parsed.context.length > 0) {
    lines.push('Conversation context leading to this forward:');
    for (const ctx of parsed.context) {
      lines.push(`  ${ctx}`);
    }
  }

  lines.push('', `The actual request/message:`, `"${parsed.actualMessage}"`);
  lines.push(
    '',
    `CRITICAL: Reply naturally to the actual request above. Do NOT echo or repeat the forwarding metadata. Respond as if ${parsed.senderLabel} asked you directly.`,
  );

  return lines;
}
