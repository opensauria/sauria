import { html, nothing } from 'lit';
import type { TemplateResult } from 'lit';
import type { AgentNode, ConvMessage } from '../types.js';
import { formatTime } from '../helpers.js';

export function renderConversation(
  nodes: AgentNode[],
  conversationBuffer: Map<string, ConvMessage[]>,
  activeNodeIds: Set<string>,
  activeConvKey: string | null,
  closeFn: () => void,
): TemplateResult | typeof nothing {
  if (!activeConvKey) return nothing;

  const [id1, id2] = activeConvKey.split('|');
  const fromNode = nodes.find((n) => n.id === id1);
  const toNode = nodes.find((n) => n.id === id2);
  const messages = conversationBuffer.get(activeConvKey) ?? [];
  const isProcessing = activeNodeIds.has(id1) || activeNodeIds.has(id2);

  return html`
    <div class="header">
      <div class="participants">
        ${renderParticipant(fromNode)}
        <span class="separator">&middot;</span>
        ${renderParticipant(toNode)}
      </div>
      ${renderCloseButton(closeFn)}
    </div>
    <div class="messages">
      ${messages.length === 0
        ? html`<div class="conv-empty">Messages will appear here when agents communicate on this edge.</div>`
        : messages.map((msg) => renderMessage(msg, msg.from === id1 ? 'from' : 'to', nodes))}
    </div>
    <div class="status ${isProcessing ? '' : 'idle'}">
      ${isProcessing ? 'Processing...' : 'Processing complete'}
    </div>
  `;
}

export function renderFeed(
  nodes: AgentNode[],
  conversationBuffer: Map<string, ConvMessage[]>,
  feedFilterNodeId: string | null,
  setFilter: (id: string | null) => void,
  closeFn: () => void,
): TemplateResult {
  const allMessages = collectAllMessages(conversationBuffer, feedFilterNodeId);
  const nodeIds = getConversationNodeIds(conversationBuffer);

  return html`
    <div class="header">
      <div class="participants">
        <div class="feed-title">
          <span class="feed-title-text">Activity Feed</span>
          <span class="feed-count">${allMessages.length} messages</span>
        </div>
      </div>
      ${renderCloseButton(closeFn)}
    </div>
    <div class="filters">
      <button class="filter-pill ${!feedFilterNodeId ? 'active' : ''}"
        @click=${() => { setFilter(null); }}>All</button>
      ${[...nodeIds].map((nid) => {
        const node = nodes.find((n) => n.id === nid);
        const label = node ? (node.meta.firstName || node.label.replace(/^@/, '')) : nid.slice(0, 6);
        return html`
          <button class="filter-pill ${feedFilterNodeId === nid ? 'active' : ''}"
            @click=${() => { setFilter(nid); }}>${label}</button>
        `;
      })}
    </div>
    <div class="messages">
      ${allMessages.length === 0
        ? html`<div class="conv-empty">Messages will appear here as agents communicate.</div>`
        : allMessages.map((msg) => renderMessage(msg, 'from', nodes))}
    </div>
  `;
}

export function renderParticipant(node: AgentNode | undefined): TemplateResult | typeof nothing {
  if (!node) return nothing;
  const name = node.meta.firstName || node.label.replace(/^@/, '');
  return html`
    <div class="participant">
      <div class="participant-avatar"></div>
      <span>${name}</span>
    </div>
  `;
}

export function renderMessage(msg: ConvMessage, side: string, nodes: AgentNode[]): TemplateResult {
  const node = nodes.find((n) => n.id === msg.from);
  return html`
    <div class="msg-row ${side}">
      <div class="msg-avatar">
        ${node?.photo ? html`<img src="${node.photo}" alt="" />` : nothing}
      </div>
      <div class="msg-bubble">
        <div class="msg-sender">${msg.fromLabel}</div>
        <div class="msg-content">${msg.content}</div>
        <div class="msg-footer">
          <span class="msg-type-badge">${msg.actionType}</span>
          <span class="msg-time">${formatTime(msg.timestamp)}</span>
        </div>
      </div>
    </div>
  `;
}

export function collectAllMessages(
  conversationBuffer: Map<string, ConvMessage[]>,
  filterNodeId: string | null,
): ConvMessage[] {
  const all: ConvMessage[] = [];
  for (const [, msgs] of conversationBuffer) {
    for (const msg of msgs) {
      if (!filterNodeId || msg.from === filterNodeId || msg.to === filterNodeId) {
        all.push(msg);
      }
    }
  }
  all.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  return all;
}

export function getConversationNodeIds(conversationBuffer: Map<string, ConvMessage[]>): Set<string> {
  const ids = new Set<string>();
  for (const [key] of conversationBuffer) {
    const parts = key.split('|');
    ids.add(parts[0]);
    ids.add(parts[1]);
  }
  return ids;
}

function renderCloseButton(closeFn: () => void): TemplateResult {
  return html`
    <button class="close-btn" @click=${closeFn}>
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
        <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
    </button>
  `;
}
