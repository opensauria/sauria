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
    :host {
      display: block;
    }
    .panel {
      position: fixed;
      top: 0;
      right: 0;
      bottom: 0;
      width: 340px;
      max-width: 100%;
      background: var(--bg-solid);
      border-left: 1px solid var(--border);
      z-index: var(--z-modal);
      transform: translateX(100%);
      transition: transform var(--transition-normal);
      display: flex;
      flex-direction: column;
    }
    .panel.open {
      transform: translateX(0);
    }
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--spacing-md);
      border-bottom: 1px solid var(--border);
    }
    .close-btn {
      width: var(--spacing-xl);
      height: var(--spacing-xl);
      display: flex;
      align-items: center;
      justify-content: center;
      background: none;
      border: none;
      cursor: pointer;
      color: var(--text-secondary);
      border-radius: var(--radius-sm);
    }
    .close-btn:hover {
      background: var(--surface-hover);
    }
    .participants {
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
      flex: 1;
    }
    .participant {
      display: flex;
      align-items: center;
      gap: var(--spacing-xs);
      font-size: var(--font-size-base);
      color: var(--text-secondary);
    }
    .participant-avatar {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--surface);
      flex-shrink: 0;
    }
    .participant-avatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .separator {
      color: var(--text-dim);
    }
    .feed-title {
      display: flex;
      flex-direction: column;
    }
    .feed-title-text {
      font-size: var(--font-size-base);
      font-weight: 500;
      color: var(--text);
    }
    .feed-count {
      font-size: var(--font-size-micro);
      color: var(--text-secondary);
    }
    .filters {
      display: flex;
      gap: var(--spacing-xs);
      padding: var(--spacing-sm) var(--spacing-md);
      overflow-x: auto;
      border-bottom: 1px solid var(--border);
    }
    .filter-pill {
      padding: var(--spacing-xs) var(--spacing-smd);
      border-radius: var(--radius-pill);
      background: var(--surface);
      border: 1px solid var(--border);
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      cursor: pointer;
      white-space: nowrap;
    }
    .filter-pill.active {
      background: var(--accent);
      color: var(--text-on-accent);
      border-color: var(--accent);
    }
    .messages {
      flex: 1;
      overflow-y: auto;
      padding: var(--spacing-md);
    }
    .conv-empty {
      text-align: center;
      color: var(--text-dim);
      font-size: var(--font-size-base);
      padding: var(--spacing-xl) var(--spacing-md);
    }
    .msg-row {
      display: flex;
      gap: var(--spacing-sm);
      margin-bottom: var(--spacing-smd);
    }
    .msg-row.to {
      flex-direction: row-reverse;
    }
    .msg-avatar {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--surface);
      flex-shrink: 0;
    }
    .msg-avatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .msg-bubble {
      max-width: 260px;
      background: var(--surface);
      border-radius: var(--radius);
      padding: var(--spacing-sm) var(--spacing-smd);
    }
    .msg-row.to .msg-bubble {
      background: var(--accent-subtle);
    }
    .msg-sender {
      font-size: var(--font-size-micro);
      color: var(--text-secondary);
      margin-bottom: 2px;
    }
    .msg-content {
      font-size: var(--font-size-base);
      color: var(--text);
      line-height: 1.4;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .msg-footer {
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
      margin-top: var(--spacing-xs);
    }
    .msg-type-badge {
      font-size: var(--font-size-micro);
      padding: 2px var(--spacing-sm);
      border-radius: var(--spacing-xs);
      background: var(--surface-hover);
      color: var(--text-dim);
    }
    .msg-time {
      font-size: var(--font-size-micro);
      color: var(--text-dim);
    }
    .status {
      padding: var(--spacing-sm) var(--spacing-md);
      font-size: var(--font-size-small);
      color: var(--text-secondary);
      border-top: 1px solid var(--border);
    }
    .status.idle {
      color: var(--text-dim);
    }
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
    const closeFn = () => {
      this.close();
      fire(this, 'close');
    };

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
        (id) => {
          this.feedFilterNodeId = id;
        },
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
