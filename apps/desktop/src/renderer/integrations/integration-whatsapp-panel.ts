import { html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { LightDomElement } from '../shared/light-dom-element.js';
import type { ChannelBot } from '../shared/types.js';
import { connectChannel, disconnectChannel, getWhatsappStatus } from '../shared/ipc.js';
import { trashIcon, plusIcon } from '../shared/icons.js';
import { t } from '../i18n.js';

@customElement('integration-whatsapp-panel')
export class IntegrationWhatsappPanel extends LightDomElement {
  @state() private bots: readonly ChannelBot[] = [];
  @state() private showForm = false;
  @state() private submitting = false;
  @state() private statusText = '';
  @state() private statusClass = '';

  override connectedCallback() {
    super.connectedCallback();
    this.loadBots();
  }

  override render() {
    const connected = this.bots.filter((b) => b.connected);

    return html`
      ${connected.length > 0
        ? html`<div class="ch-bot-list">${connected.map((bot) => this.renderBotCard(bot))}</div>`
        : nothing}
      <div
        class="ch-connect-section"
        style="${connected.length > 0 && !this.showForm ? 'display:none' : ''}"
      >
        <div class="form-group">
          <label class="form-label">${t('integ.whatsappPhoneId')}</label>
          <input
            class="form-input"
            type="text"
            id="wa-phoneid"
            placeholder="${t('integ.whatsappPhoneIdHint')}"
            autocomplete="off"
            @input=${this.validate}
          />
        </div>
        <div class="form-group">
          <label class="form-label">${t('integ.whatsappAccessToken')}</label>
          <input
            class="form-input"
            type="password"
            id="wa-token"
            placeholder="${t('integ.whatsappAccessTokenHint')}"
            autocomplete="off"
            @input=${this.validate}
          />
        </div>
        <div class="form-group">
          <label class="form-label">${t('integ.whatsappAppSecret')}</label>
          <input
            class="form-input"
            type="password"
            id="wa-secret"
            placeholder="${t('integ.whatsappAppSecretHint')}"
            autocomplete="off"
          />
        </div>
        ${this.statusText
          ? html`<div class="form-status visible ${this.statusClass}">${this.statusText}</div>`
          : nothing}
        <div class="form-actions">
          <button
            class="btn btn-primary"
            ?disabled=${this.submitting || !this.isValid()}
            @click=${this.handleSubmit}
          >
            ${t('integ.connectBot')}
          </button>
        </div>
      </div>
      ${connected.length > 0 && !this.showForm
        ? html`
            <button class="ch-add-card" @click=${() => (this.showForm = true)}>
              ${plusIcon()}
              <span>${t('integ.addBot')}</span>
            </button>
          `
        : nothing}
    `;
  }

  private renderBotCard(bot: ChannelBot) {
    const name = bot.label || 'WhatsApp';

    return html`
      <div class="ch-bot-card">
        <div class="ch-bot-avatar-placeholder">
          <img src="/icons/integrations/whatsapp.svg" alt="" />
        </div>
        <div class="ch-bot-info">
          <div class="ch-bot-name">${name}</div>
          <div class="ch-bot-status"><span class="ch-bot-dot"></span>${t('integ.online')}</div>
        </div>
        <button
          class="ch-bot-disconnect"
          title="${t('integ.disconnect')}"
          @click=${(e: Event) => this.handleDisconnect(e, bot.nodeId ?? '')}
        >
          ${trashIcon()}
        </button>
      </div>
    `;
  }

  private async loadBots() {
    const status = await getWhatsappStatus();
    this.bots = status.bots ?? [];
    this.fireStatusChange();
  }

  private getPhoneIdInput(): HTMLInputElement | null {
    return this.querySelector<HTMLInputElement>('#wa-phoneid');
  }

  private getTokenInput(): HTMLInputElement | null {
    return this.querySelector<HTMLInputElement>('#wa-token');
  }

  private getSecretInput(): HTMLInputElement | null {
    return this.querySelector<HTMLInputElement>('#wa-secret');
  }

  private isValid(): boolean {
    const phoneId = this.getPhoneIdInput()?.value.trim() ?? '';
    const token = this.getTokenInput()?.value.trim() ?? '';
    return phoneId.length > 0 && token.length > 0;
  }

  private validate() {
    this.requestUpdate();
  }

  private async handleSubmit() {
    const phoneIdInput = this.getPhoneIdInput();
    const tokenInput = this.getTokenInput();
    const secretInput = this.getSecretInput();
    if (!phoneIdInput || !tokenInput) return;

    this.submitting = true;
    this.statusText = t('integ.connecting');
    this.statusClass = '';

    try {
      const credentials: Record<string, unknown> = {
        phoneNumberId: phoneIdInput.value.trim(),
        accessToken: tokenInput.value.trim(),
      };
      const appSecret = secretInput?.value.trim();
      if (appSecret) {
        credentials['appSecret'] = appSecret;
      }

      const result = await connectChannel('whatsapp', credentials);
      if (result.success) {
        this.statusText = `${t('integ.connectedTo')} ${result.displayName ?? 'WhatsApp'}`;
        this.statusClass = 'success';
        setTimeout(() => this.loadBots(), 800);
      } else {
        this.statusText = result.error ?? t('integ.connectionFailed');
        this.statusClass = 'error';
        this.submitting = false;
      }
    } catch {
      this.statusText = t('integ.connectionFailed');
      this.statusClass = 'error';
      this.submitting = false;
    }
  }

  private async handleDisconnect(e: Event, nodeId: string) {
    e.stopPropagation();
    if (!nodeId) return;
    await disconnectChannel('whatsapp', nodeId);
    await this.loadBots();
  }

  private fireStatusChange() {
    this.showForm = false;
    this.submitting = false;
    this.statusText = '';
    this.statusClass = '';
    this.dispatchEvent(
      new CustomEvent('whatsapp-status-change', {
        detail: { bots: this.bots },
        bubbles: true,
      }),
    );
  }
}
