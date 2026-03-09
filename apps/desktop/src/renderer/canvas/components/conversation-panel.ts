import { html, nothing, type PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { AgentNode, ConvMessage } from '../types.js';
import { convKey } from '../helpers.js';
import { fire } from '../fire.js';
import { LightDomElement } from '../light-dom-element.js';
import { renderConversation, renderFeed } from './conversation-render.js';

@customElement('conversation-panel')
export class ConversationPanel extends LightDomElement {
  @property({ attribute: false }) nodes: AgentNode[] = [];
  @property({ attribute: false }) conversationBuffer = new Map<string, ConvMessage[]>();
  @property({ attribute: false }) activeNodeIds = new Set<string>();

  @state() private isOpen = false;
  @state() private activeConvKey: string | null = null;
  @state() private isFeedMode = false;
  @state() private feedFilterNodeId: string | null = null;
  @state() private messageVersion = 0;

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

  override updated(changed: PropertyValues): void {
    if (changed.has('messageVersion') && this.isOpen) {
      const container = this.querySelector('.conv-messages');
      if (!container) return;
      const justOpened = changed.has('isOpen') && !changed.get('isOpen');
      const threshold = 80;
      const isNearBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
      if (justOpened || isNearBottom) container.scrollTop = container.scrollHeight;
    }
  }

  render() {
    const closeFn = () => {
      this.close();
      fire(this, 'close');
    };

    return html`
      <div class="conv-panel ${this.isOpen ? 'open' : ''}">
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
