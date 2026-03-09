import { html, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { t } from '../../i18n.js';
import { LightDomElement } from '../light-dom-element.js';

@customElement('canvas-empty-state')
export class CanvasEmptyState extends LightDomElement {
  @property({ type: Number }) nodeCount = 0;

  render() {
    if (this.nodeCount > 0) return nothing;
    return html`
      <div class="canvas-empty">
        <div class="canvas-empty-icons">
          <img src="/icons/telegram.svg" alt="Telegram" />
          <img src="/icons/slack.svg" alt="Slack" />
          <img src="/icons/whatsapp.svg" alt="WhatsApp" />
        </div>
        <h2>${t('canvas.addFirstAgent')}</h2>
        <p>${t('canvas.dragHint')}</p>
      </div>
    `;
  }
}
