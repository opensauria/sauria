import { html, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { t } from '../../i18n.js';
import { LightDomElement } from '../light-dom-element.js';

@customElement('confirm-dialog')
export class ConfirmDialog extends LightDomElement {
  @property({ type: Boolean }) open = false;
  @property() message = '';

  private handleOverlayClick(e: MouseEvent): void {
    if (e.target === e.currentTarget) {
      this.dispatchEvent(new CustomEvent('cancel', { bubbles: true, composed: true }));
    }
  }

  private handleConfirm(): void {
    this.dispatchEvent(new CustomEvent('confirm', { bubbles: true, composed: true }));
  }

  private handleCancel(): void {
    this.dispatchEvent(new CustomEvent('cancel', { bubbles: true, composed: true }));
  }

  render() {
    if (!this.open) return nothing;
    return html`
      <div class="confirm-overlay open" @click=${this.handleOverlayClick}>
        <div class="confirm-dialog">
          <p>${t(this.message)}</p>
          <div class="confirm-actions">
            <button class="confirm-btn confirm-btn-cancel" @click=${this.handleCancel}>
              ${t('common.cancel')}
            </button>
            <button class="confirm-btn confirm-btn-danger" @click=${this.handleConfirm}>
              ${t('canvas.remove')}
            </button>
          </div>
        </div>
      </div>
    `;
  }
}
