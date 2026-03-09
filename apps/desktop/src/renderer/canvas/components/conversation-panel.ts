import { html, nothing, type PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { AgentNode, ConvMessage } from '../types.js';
import { convKey } from '../helpers.js';
import { fire } from '../fire.js';
import { LightDomElement } from '../light-dom-element.js';
import { renderConversation, renderFeed } from './conversation-render.js';

const MIN_PANEL_WIDTH = 280;
const MAX_PANEL_WIDTH = 600;

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
  @state() private panelWidth = 340;
  @state() private isResizing = false;

  openEdgeConversation(fromId: string, toId: string): void {
    this.activeConvKey = convKey(fromId, toId);
    this.isFeedMode = false;
    this.feedFilterNodeId = null;
    this.isOpen = true;
    this.messageVersion++;
    this.addClickOutsideListener();
  }

  openFeed(): void {
    this.isFeedMode = true;
    this.feedFilterNodeId = null;
    this.activeConvKey = null;
    this.isOpen = true;
    this.messageVersion++;
    this.addClickOutsideListener();
  }

  close(): void {
    this.isOpen = false;
    this.activeConvKey = null;
    this.isFeedMode = false;
    this.removeClickOutsideListener();
  }

  private addClickOutsideListener(): void {
    this.removeClickOutsideListener();
    requestAnimationFrame(() => {
      document.addEventListener('mousedown', this.handleClickOutside);
    });
  }

  private removeClickOutsideListener(): void {
    document.removeEventListener('mousedown', this.handleClickOutside);
  }

  private handleClickOutside = (e: MouseEvent): void => {
    const panel = this.querySelector('.conv-panel');
    if (!panel || !this.isOpen) return;
    if (panel.contains(e.target as Node)) return;
    // Don't close if clicking toolbar buttons (they toggle feed)
    const toolbar = (e.target as Element)?.closest('.canvas-toolbar');
    if (toolbar) return;
    this.close();
    fire(this, 'close');
  };

  notifyMessage(): void {
    this.messageVersion++;
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.removeClickOutsideListener();
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
      <div class="conv-panel ${this.isOpen ? 'open' : ''}" style="width: ${this.panelWidth}px">
        ${this.isOpen
          ? html`
              <div
                class="panel-resize-handle ${this.isResizing ? 'dragging' : ''}"
                @mousedown=${this.startResize}
              ></div>
              ${this.renderContent(closeFn)}
            `
          : nothing}
      </div>
    `;
  }

  private startResize = (e: MouseEvent): void => {
    e.preventDefault();
    this.isResizing = true;
    const startX = e.clientX;
    const startWidth = this.panelWidth;

    const onMove = (ev: MouseEvent) => {
      const delta = startX - ev.clientX;
      this.panelWidth = Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, startWidth + delta));
    };

    const onUp = () => {
      this.isResizing = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

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
