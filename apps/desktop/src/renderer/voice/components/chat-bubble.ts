import { html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { LightDomElement } from '../../shared/light-dom-element.js';
import type { ChatMessage } from '../types.js';

@customElement('voice-chat-bubble')
export class VoiceChatBubble extends LightDomElement {
  @property({ type: Object }) message!: ChatMessage;

  override render() {
    const { role, text } = this.message;
    return html`
      <div class="voice-bubble voice-bubble--${role}">
        <span class="voice-bubble__text">${text}</span>
      </div>
    `;
  }
}
