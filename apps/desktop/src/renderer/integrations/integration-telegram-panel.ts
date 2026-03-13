import { html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { LightDomElement } from '../shared/light-dom-element.js';
import type { TelegramBot } from '../shared/types.js';
import { connectChannel, disconnectChannel, getTelegramStatus } from '../shared/ipc.js';
import { trashIcon, plusIcon } from '../shared/icons.js';
import { t } from '../i18n.js';

@customElement('integration-telegram-panel')
export class IntegrationTelegramPanel extends LightDomElement {
  @state() private bots: readonly TelegramBot[] = [];
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
          <label class="form-label">${t('integ.telegramUserId')}</label>
          <input
            class="form-input"
            type="text"
            id="tg-userid"
            placeholder="${t('integ.userIdHint')}"
            autocomplete="off"
            @input=${this.validate}
          />
        </div>
        <div class="form-group">
          <label class="form-label">${t('integ.botToken')}</label>
          <input
            class="form-input"
            type="password"
            id="tg-token"
            placeholder="${t('integ.tokenHint')}"
            autocomplete="off"
            @input=${this.validate}
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

  private renderBotCard(bot: TelegramBot) {
    const name = bot.label || (bot.profile ? `@${bot.profile.username}` : 'Telegram Bot');
    const photo = bot.photo || bot.profile?.photo;

    return html`
      <div class="ch-bot-card">
        ${photo
          ? html`<img class="ch-bot-avatar" src="${photo}" alt="" />`
          : html`<div class="ch-bot-avatar-placeholder">
              <img src="/icons/integrations/telegram.svg" alt="" />
            </div>`}
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
    const status = await getTelegramStatus();
    this.bots = status.bots ?? [];
    this.fireStatusChange();
  }

  private getUserIdInput(): HTMLInputElement | null {
    return this.querySelector<HTMLInputElement>('#tg-userid');
  }

  private getTokenInput(): HTMLInputElement | null {
    return this.querySelector<HTMLInputElement>('#tg-token');
  }

  private isValid(): boolean {
    const userId = this.getUserIdInput()?.value.trim() ?? '';
    const token = this.getTokenInput()?.value.trim() ?? '';
    return userId.length > 0 && token.length > 0;
  }

  private validate() {
    this.requestUpdate();
  }

  private async handleSubmit() {
    const userIdInput = this.getUserIdInput();
    const tokenInput = this.getTokenInput();
    if (!userIdInput || !tokenInput) return;

    const rawId = userIdInput.value.trim().replace(/\D/g, '');
    const parsedId = parseInt(rawId, 10);
    if (!rawId || isNaN(parsedId) || parsedId <= 0) {
      this.statusText = t('integ.userIdError');
      this.statusClass = 'error';
      userIdInput.focus();
      return;
    }

    this.submitting = true;
    this.statusText = t('integ.connecting');
    this.statusClass = '';

    try {
      const result = await connectChannel('telegram', {
        token: tokenInput.value.trim(),
        userId: parsedId,
      });
      if (result.success) {
        this.statusText = `${t('integ.connectedTo')} @${result.botUsername}`;
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
    await disconnectChannel('telegram', nodeId);
    await this.loadBots();
  }

  private fireStatusChange() {
    this.showForm = false;
    this.submitting = false;
    this.statusText = '';
    this.statusClass = '';
    this.dispatchEvent(
      new CustomEvent('telegram-status-change', {
        detail: { bots: this.bots },
        bubbles: true,
      }),
    );
  }
}
