import { LitElement, html, css, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { AgentNode, ConvMessage } from '../types.js';
import { PLATFORM_ICONS } from '../constants.js';
import { escapeHtml, formatTime, convKey } from '../helpers.js';

@customElement('conversation-panel')
export class ConversationPanel extends LitElement {
  @property({ attribute: false }) nodes: AgentNode[] = [];
  @property({ attribute: false }) conversationBuffer = new Map<string, ConvMessage[]>();
  @property({ attribute: false }) activeNodeIds = new Set<string>();

  @state() private isOpen = false;
  @state() private activeConvKey: string | null = null;
  @state() private isFeedMode = false;
  @state() private feedFilterNodeId: string | null = null;
  @state() private messageVersion = 0;

  static styles = css`
    :host { display: contents; }
    .panel {
      position: fixed; top: 0; right: 0; bottom: 0;
      width: 360px; max-width: 100%;
      background: var(--bg, #1a1a1a);
      border-left: 1px solid var(--border, rgba(255,255,255,0.08));
      z-index: 100;
      transform: translateX(100%);
      transition: transform 0.2s ease;
      display: flex; flex-direction: column;
    }
    .panel.open { transform: translateX(0); }
    .header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 12px 16px; border-bottom: 1px solid var(--border);
    }
    .close-btn {
      width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;
      background: none; border: none; cursor: pointer; color: var(--text-secondary, #999);
      border-radius: var(--radius-sm, 8px);
    }
    .close-btn:hover { background: rgba(255,255,255,0.06); }
    .participants { display: flex; align-items: center; gap: 8px; flex: 1; }
    .participant {
      display: flex; align-items: center; gap: 4px;
      font-size: 13px; color: var(--text-secondary);
    }
    .participant-avatar {
      width: 24px; height: 24px; border-radius: 50%; overflow: hidden;
      display: flex; align-items: center; justify-content: center;
      background: var(--surface); flex-shrink: 0;
    }
    .participant-avatar img { width: 100%; height: 100%; object-fit: cover; }
    .separator { color: var(--text-dim, #555); }
    .feed-title { display: flex; flex-direction: column; }
    .feed-title-text { font-size: 14px; font-weight: 500; color: var(--text); }
    .feed-count { font-size: 11px; color: var(--text-secondary); }
    .filters {
      display: flex; gap: 4px; padding: 8px 16px; overflow-x: auto;
      border-bottom: 1px solid var(--border);
    }
    .filter-pill {
      padding: 4px 12px; border-radius: var(--radius-pill, 9999px);
      background: var(--surface); border: 1px solid var(--border);
      color: var(--text-secondary); font-size: 12px; cursor: pointer;
      white-space: nowrap;
    }
    .filter-pill.active { background: var(--accent); color: #fff; border-color: var(--accent); }
    .messages { flex: 1; overflow-y: auto; padding: 16px; }
    .conv-empty {
      text-align: center; color: var(--text-dim); font-size: 13px; padding: 32px 16px;
    }
    .msg-row { display: flex; gap: 8px; margin-bottom: 12px; }
    .msg-row.to { flex-direction: row-reverse; }
    .msg-avatar {
      width: 28px; height: 28px; border-radius: 50%; overflow: hidden;
      display: flex; align-items: center; justify-content: center;
      background: var(--surface); flex-shrink: 0;
    }
    .msg-avatar img { width: 100%; height: 100%; object-fit: cover; }
    .msg-bubble {
      max-width: 260px; background: var(--surface);
      border-radius: 12px; padding: 8px 12px;
    }
    .msg-row.to .msg-bubble { background: rgba(3,139,154,0.15); }
    .msg-sender { font-size: 11px; color: var(--text-secondary); margin-bottom: 2px; }
    .msg-content { font-size: 13px; color: var(--text); line-height: 1.4; white-space: pre-wrap; word-break: break-word; }
    .msg-footer { display: flex; align-items: center; gap: 8px; margin-top: 4px; }
    .msg-type-badge {
      font-size: 10px; padding: 1px 6px; border-radius: 4px;
      background: rgba(255,255,255,0.06); color: var(--text-dim);
    }
    .msg-time { font-size: 10px; color: var(--text-dim); }
    .status {
      padding: 8px 16px; font-size: 12px; color: var(--text-secondary);
      border-top: 1px solid var(--border);
    }
    .status.idle { color: var(--text-dim); }
  `;

  private fire(name: string, detail?: unknown): void {
    this.dispatchEvent(new CustomEvent(name, { bubbles: true, composed: true, detail }));
  }

  /** Open edge conversation between two nodes. */
  openEdgeConversation(fromId: string, toId: string): void {
    this.activeConvKey = convKey(fromId, toId);
    this.isFeedMode = false;
    this.feedFilterNodeId = null;
    this.isOpen = true;
    this.messageVersion++;
  }

  /** Open activity feed mode. */
  openFeed(): void {
    this.isFeedMode = true;
    this.feedFilterNodeId = null;
    this.activeConvKey = null;
    this.isOpen = true;
    this.messageVersion++;
  }

  close(): void {
    this.isOpen = false;
    this.activeConvKey = null;
    this.isFeedMode = false;
  }

  /** Notify that a new message arrived — triggers re-render. */
  notifyMessage(): void {
    this.messageVersion++;
  }

  render() {
    return html`
      <div class="panel ${this.isOpen ? 'open' : ''}">
        ${this.isOpen ? this.renderContent() : nothing}
      </div>
    `;
  }

  private renderContent() {
    if (this.isFeedMode) return this.renderFeed();
    return this.renderConversation();
  }

  private renderConversation() {
    const key = this.activeConvKey;
    if (!key) return nothing;

    const [id1, id2] = key.split('|');
    const fromNode = this.nodes.find((n) => n.id === id1);
    const toNode = this.nodes.find((n) => n.id === id2);
    const messages = this.conversationBuffer.get(key) ?? [];

    const fromActive = this.activeNodeIds.has(id1);
    const toActive = this.activeNodeIds.has(id2);
    const isProcessing = fromActive || toActive;

    return html`
      <div class="header">
        <div class="participants">
          ${this.renderParticipant(fromNode)}
          <span class="separator">&middot;</span>
          ${this.renderParticipant(toNode)}
        </div>
        <button class="close-btn" @click=${() => { this.close(); this.fire('close'); }}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
            <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </button>
      </div>
      <div class="messages">
        ${messages.length === 0
          ? html`<div class="conv-empty">Messages will appear here when agents communicate on this edge.</div>`
          : messages.map((msg) => this.renderMessage(msg, msg.from === id1 ? 'from' : 'to'))}
      </div>
      <div class="status ${isProcessing ? '' : 'idle'}">
        ${isProcessing ? 'Processing...' : 'Processing complete'}
      </div>
    `;
  }

  private renderFeed() {
    const allMessages = this.collectAllMessages(this.feedFilterNodeId);
    const nodeIds = this.getConversationNodeIds();

    return html`
      <div class="header">
        <div class="participants">
          <div class="feed-title">
            <span class="feed-title-text">Activity Feed</span>
            <span class="feed-count">${allMessages.length} messages</span>
          </div>
        </div>
        <button class="close-btn" @click=${() => { this.close(); this.fire('close'); }}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
            <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </button>
      </div>
      <div class="filters">
        <button class="filter-pill ${!this.feedFilterNodeId ? 'active' : ''}"
          @click=${() => { this.feedFilterNodeId = null; }}>All</button>
        ${[...nodeIds].map((nid) => {
          const node = this.nodes.find((n) => n.id === nid);
          const label = node ? (node.meta.firstName || node.label.replace(/^@/, '')) : nid.slice(0, 6);
          return html`
            <button class="filter-pill ${this.feedFilterNodeId === nid ? 'active' : ''}"
              @click=${() => { this.feedFilterNodeId = nid; }}>${label}</button>
          `;
        })}
      </div>
      <div class="messages">
        ${allMessages.length === 0
          ? html`<div class="conv-empty">Messages will appear here as agents communicate.</div>`
          : allMessages.map((msg) => this.renderMessage(msg, 'from'))}
      </div>
    `;
  }

  private renderParticipant(node: AgentNode | undefined) {
    if (!node) return nothing;
    const name = node.meta.firstName || node.label.replace(/^@/, '');
    return html`
      <div class="participant">
        <div class="participant-avatar"></div>
        <span>${name}</span>
      </div>
    `;
  }

  private renderMessage(msg: ConvMessage, side: string) {
    const node = this.nodes.find((n) => n.id === msg.from);
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

  private collectAllMessages(filterNodeId: string | null): ConvMessage[] {
    const all: ConvMessage[] = [];
    for (const [, msgs] of this.conversationBuffer) {
      for (const msg of msgs) {
        if (!filterNodeId || msg.from === filterNodeId || msg.to === filterNodeId) {
          all.push(msg);
        }
      }
    }
    all.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    return all;
  }

  private getConversationNodeIds(): Set<string> {
    const ids = new Set<string>();
    for (const [key] of this.conversationBuffer) {
      const parts = key.split('|');
      ids.add(parts[0]);
      ids.add(parts[1]);
    }
    return ids;
  }
}
