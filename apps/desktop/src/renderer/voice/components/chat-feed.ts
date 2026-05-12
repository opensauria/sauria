import { html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { LightDomElement } from '../../shared/light-dom-element.js';
import type { ChatMessage } from '../types.js';

import './chat-bubble.js';

@customElement('voice-chat-feed')
export class VoiceChatFeed extends LightDomElement {
  @property({ type: Array }) messages: readonly ChatMessage[] = [];

  override updated(changed: Map<string, unknown>): void {
    if (changed.has('messages')) {
      this.scrollToBottom();
    }
  }

  private scrollToBottom(): void {
    requestAnimationFrame(() => {
      const container = this.querySelector('.voice-feed__scroll');
      if (container) container.scrollTop = container.scrollHeight;
    });
  }

  override render() {
    if (this.messages.length === 0) return html``;
    return html`
      <div class="voice-feed">
        <div class="voice-feed__scroll">
          ${this.messages.map(
            (msg) => html`<voice-chat-bubble .message=${msg}></voice-chat-bubble>`,
          )}
        </div>
      </div>
    `;
  }
}
