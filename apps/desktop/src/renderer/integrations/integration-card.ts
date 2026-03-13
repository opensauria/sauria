import { html, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { LightDomElement } from '../shared/light-dom-element.js';
import { t } from '../i18n.js';

@customElement('integration-card')
export class IntegrationCard extends LightDomElement {
  @property() integrationId = '';
  @property() name = '';
  @property() icon = '';
  @property() description = '';
  @property() category = '';
  @property({ type: Boolean }) connected = false;
  @property({ type: Number }) toolCount = 0;
  @property() toolLabel = '';

  override render() {
    const badgeClass = this.connected ? 'badge badge-success' : 'badge badge-error';
    const badgeText = this.connected ? t('integ.connected') : t('integ.disconnected');

    return html`
      <div
        class="card card-vertical ${this.connected ? 'connected' : ''}"
        @click=${this.handleClick}
      >
        <div class="card-header">
          <img
            class="card-icon-img"
            src="/icons/integrations/${this.icon}.svg"
            alt=""
            @error=${this.handleImgError}
          />
          <span class="card-name">${this.name}</span>
        </div>
        <div class="card-description">${this.description}</div>
        <div class="card-footer">
          <span class=${badgeClass}>${badgeText}</span>
          ${this.toolCount > 0
            ? html`<span class="badge badge-accent">${this.toolCount} ${this.toolLabel}</span>`
            : nothing}
        </div>
        <span class="card-category">${this.category}</span>
      </div>
    `;
  }

  private handleClick() {
    this.dispatchEvent(
      new CustomEvent('card-click', {
        detail: { id: this.integrationId },
        bubbles: true,
      }),
    );
  }

  private handleImgError(e: Event) {
    const img = e.target as HTMLImageElement;
    if (!img.parentElement) return;
    const fallback = document.createElement('span');
    fallback.className = 'card-icon-img';
    fallback.textContent = (this.name || this.integrationId || '?').charAt(0).toUpperCase();
    fallback.style.cssText =
      'display:flex;align-items:center;justify-content:center;font-size:var(--font-size-heading);font-weight:600;color:var(--text-secondary);background:var(--surface);border-radius:var(--radius-sm);';
    img.replaceWith(fallback);
  }
}
