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
      <div class="integration-card ${this.connected ? 'connected' : ''}" @click=${this.handleClick}>
        <div class="integration-card-header">
          <img
            class="integration-card-icon"
            src="/icons/integrations/${this.icon}.svg"
            alt=""
            @error=${this.handleImgError}
          />
          <span class="integration-card-name">${this.name}</span>
        </div>
        <div class="integration-card-description">${this.description}</div>
        <div class="integration-card-footer">
          <span class=${badgeClass}>${badgeText}</span>
          ${this.toolCount > 0
            ? html`<span class="badge badge-accent">${this.toolCount} ${this.toolLabel}</span>`
            : nothing}
        </div>
        <span class="integration-card-category">${this.category}</span>
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
    (e.target as HTMLElement).style.display = 'none';
  }
}
