import { LitElement, html, css, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { t } from '../../i18n.js';

@customElement('confirm-dialog')
export class ConfirmDialog extends LitElement {
  @property({ type: Boolean }) open = false;
  @property() message = '';

  static styles = css`
    :host {
      display: contents;
    }
    .overlay {
      position: fixed;
      inset: 0;
      background: var(--overlay);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 200;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.15s ease;
    }
    .overlay.open {
      opacity: 1;
      pointer-events: auto;
    }
    .dialog {
      background: var(--bg-solid);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 24px;
      max-width: 360px;
      width: 90%;
    }
    p {
      margin: 0 0 20px;
      font-size: 14px;
      color: var(--text);
    }
    .actions {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
    }
    button {
      padding: 8px 16px;
      border: none;
      border-radius: var(--radius-sm);
      font-size: 14px;
      cursor: pointer;
      transition: background 0.15s ease;
    }
    .btn-cancel {
      background: var(--surface);
      color: var(--text-secondary);
    }
    .btn-cancel:hover {
      background: var(--border);
    }
    .btn-danger {
      background: var(--error);
      color: var(--text-on-accent);
    }
    .btn-danger:hover {
      background: color-mix(in srgb, var(--error) 90%, transparent);
    }
  `;

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
      <div class="overlay open" @click=${this.handleOverlayClick}>
        <div class="dialog">
          <p>${this.message}</p>
          <div class="actions">
            <button class="btn-cancel" @click=${this.handleCancel}>${t('common.cancel')}</button>
            <button class="btn-danger" @click=${this.handleConfirm}>${t('canvas.remove')}</button>
          </div>
        </div>
      </div>
    `;
  }
}
