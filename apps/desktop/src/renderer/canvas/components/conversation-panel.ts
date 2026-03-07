import { LitElement, html, css, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { AgentNode, ConvMessage } from '../types.js';
import { convKey } from '../helpers.js';
import { fire } from '../fire.js';
import { renderConversation, renderFeed } from './conversation-render.js';

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
    .close-btn:hover { background: var(--surface-hover); }
    .participants { display: flex; align-items: center; gap: 8px; flex: 1; }
    .participant {
      display: flex; align-items: center; gap: 4px;
      font-size: 14px; color: var(--text-secondary);
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
    .feed-count { font-size: 10px; color: var(--text-secondary); }
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
      text-align: center; color: var(--text-dim); font-size: 14px; padding: 32px 16px;
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
    .msg-row.to .msg-bubble { background: var(--accent-subtle); }
    .msg-sender { font-size: 10px; color: var(--text-secondary); margin-bottom: 2px; }
    .msg-content { font-size: 14px; color: var(--text); line-height: 1.4; white-space: pre-wrap; word-break: break-word; }
    .msg-footer { display: flex; align-items: center; gap: 8px; margin-top: 4px; }
    .msg-type-badge {
      font-size: 10px; padding: 2px 8px; border-radius: 4px;
      background: var(--surface-hover); color: var(--text-dim);
    }
    .msg-time { font-size: 10px; color: var(--text-dim); }
    .status {
      padding: 8px 16px; font-size: 12px; color: var(--text-secondary);
      border-top: 1px solid var(--border);
    }
    .status.idle { color: var(--text-dim); }
  `;

  openEdgeConversation(fromId: string, toId: string): void {
    this.activeConvKey = convKey(fromId, toId);
    this.isFeedMode = false;
    this.feedFilterNodeId = null;
    this.isOpen = true;
    this.messageVersion++;
  }

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

  notifyMessage(): void {
    this.messageVersion++;
  }

  render() {
    const closeFn = () => { this.close(); fire(this, 'close'); };

    return html`
      <div class="panel ${this.isOpen ? 'open' : ''}">
        ${this.isOpen ? this.renderContent(closeFn) : nothing}
      </div>
    `;
  }

  private renderContent(closeFn: () => void) {
    if (this.isFeedMode) {
      return renderFeed(
        this.nodes,
        this.conversationBuffer,
        this.feedFilterNodeId,
        (id) => { this.feedFilterNodeId = id; },
        closeFn,
      );
    }
    return renderConversation(
      this.nodes,
      this.conversationBuffer,
      this.activeNodeIds,
      this.activeConvKey,
      closeFn,
    );
  }
}
