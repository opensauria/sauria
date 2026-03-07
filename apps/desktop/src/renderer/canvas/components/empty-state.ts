import { LitElement, html, css, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { t } from '../../i18n.js';

@customElement('canvas-empty-state')
export class CanvasEmptyState extends LitElement {
  @property({ type: Number }) nodeCount = 0;

  static styles = css`
    :host {
      display: contents;
    }
    .canvas-empty {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      text-align: center;
      pointer-events: none;
      z-index: 1;
    }
    .canvas-empty-icons {
      display: flex;
      gap: 16px;
      justify-content: center;
      margin-bottom: 24px;
      opacity: 0.3;
    }
    .canvas-empty-icons img {
      width: 32px;
      height: 32px;
    }
    h2 {
      margin: 0 0 8px;
      font-size: 16px;
      font-weight: 500;
      color: var(--text-secondary, #999);
    }
    p {
      margin: 0;
      font-size: 14px;
      color: var(--text-dim, #555);
    }
  `;

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
