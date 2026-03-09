import { html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { LightDomElement } from '../shared/light-dom-element.js';
import type { TelegramBot } from '../shared/types.js';
import { connectChannel, disconnectChannel, getTelegramStatus } from '../shared/ipc.js';
import { t } from '../i18n.js';


@customElement('palette-telegram-panel')
export class PaletteTelegramPanel extends LightDomElement {
  @state() private bots: TelegramBot[] = [];
  @state() private showForm = false;
  @state() private submitting = false;
  @state() private statusText = '';
  @state() private statusClass = '';

  override connectedCallback() {
    super.connectedCallback();
    this.loadBots();
    this.addEventListener('keydown', this.handleKeydown);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this.removeEventListener('keydown', this.handleKeydown);
  }

  override render() {
    const connected = this.bots.filter((b) => b.connected);

    return html`
      <div class="tg-section-title" data-i18n="palette.connectedBots">
        ${t('palette.connectedBots')}
      </div>
      <div>${connected.map((bot) => this.renderBotCard(bot))}</div>

      <button
        class="add-bot-btn"
        style="${connected.length === 0 || this.showForm ? 'display:none' : ''}"
        @mousedown=${(e: Event) => {
          e.preventDefault();
          this.showForm = true;
          this.requestUpdate();
          requestAnimationFrame(() => {
            this.querySelector<HTMLInputElement>('#tg-userid')?.focus();
          });
        }}
      >
        <img class="icon-mono" src="/icons/plus.svg" alt="" />
        <span data-i18n="palette.addBot">${t('palette.addBot')}</span>
      </button>

      <div class="tg-connect-form ${connected.length === 0 || this.showForm ? 'visible' : ''}">
        <div class="form-field">
          <label data-i18n="palette.yourUserId">${t('palette.yourUserId')}</label>
          <input
            type="text"
            id="tg-userid"
            placeholder="123456789"
            inputmode="numeric"
            autocomplete="off"
            @input=${this.validate}
          />
          <div class="field-hint" data-i18n="palette.userIdHint">${t('palette.userIdHint')}</div>
        </div>
        <div class="form-field">
          <label data-i18n="palette.botToken">${t('palette.botToken')}</label>
          <input
            type="password"
            id="tg-token"
            placeholder="123456:ABC-DEF..."
            @input=${this.validate}
          />
          <div class="field-hint" data-i18n="palette.botTokenHint">
            ${t('palette.botTokenHint')}
          </div>
        </div>
        ${this.statusText
          ? html`<div class="form-status visible ${this.statusClass}">${this.statusText}</div>`
          : nothing}
        <div class="form-actions">
          <button
            class="form-btn form-btn-cancel"
            @mousedown=${(e: Event) => {
              e.preventDefault();
              this.dispatchEvent(new CustomEvent('panel-close', { bubbles: true }));
            }}
          >
            ${t('palette.cancel')}
          </button>
          <button
            class="form-btn form-btn-primary"
            ?disabled=${this.submitting || !this.isValid()}
            @mousedown=${this.handleSubmit}
          >
            ${t('palette.connect')}
          </button>
        </div>
      </div>
    `;
  }

  private renderBotCard(bot: TelegramBot) {
    const photo = bot.photo || bot.profile?.photo;
    const name = bot.label || (bot.profile ? `@${bot.profile.username}` : 'Telegram Bot');
    const isOnline = bot.connected;
    const dotClass = isOnline ? 'bot-status-dot' : 'bot-status-dot offline';
    const statusText = isOnline ? t('palette.online') : t('palette.offline');

    return html`
      <div class="bot-card" data-node-id="${bot.nodeId ?? ''}">
        <div class="bot-avatar">
          ${photo
                    ? html`<img src="${photo}" alt="" />`
                    : html`<img src="/icons/telegram.svg" alt="" />`}
        </div>
        <div class="bot-info">
          <div class="bot-name">${name}</div>
          <div class="bot-meta">
            <span class="${dotClass}"></span>
            ${statusText}
          </div>
        </div>
        <div class="bot-actions">
          <button
            class="bot-action-btn danger"
            title="${t('palette.disconnect')}"
            @mousedown=${(e: Event) => {
              e.preventDefault();
              this.handleDisconnect(bot.nodeId ?? '');
            }}
          >
            <img class="icon-mono" src="/icons/trash-2.svg" alt="" />
          </button>
        </div>
      </div>
    `;
  }

  private async loadBots() {
    const status = await getTelegramStatus();
    this.bots = [...(status.bots ?? [])];
    this.showForm = false;
    this.submitting = false;
    this.statusText = '';
    this.statusClass = '';
  }

  private isValid(): boolean {
    const userId = this.querySelector<HTMLInputElement>('#tg-userid')?.value.trim() ?? '';
    const token = this.querySelector<HTMLInputElement>('#tg-token')?.value.trim() ?? '';
    return userId.length > 0 && token.length > 0;
  }

  private validate() {
    this.requestUpdate();
  }

  private async handleSubmit(e: Event) {
    e.preventDefault();
    if (this.submitting || !this.isValid()) return;

    const userIdInput = this.querySelector<HTMLInputElement>('#tg-userid')!;
    const tokenInput = this.querySelector<HTMLInputElement>('#tg-token')!;

    const rawId = userIdInput.value.trim().replace(/\D/g, '');
    const parsedId = parseInt(rawId, 10);
    if (!rawId || isNaN(parsedId) || parsedId <= 0) {
      this.statusText = t('palette.userIdError');
      this.statusClass = 'error';
      userIdInput.focus();
      return;
    }

    this.submitting = true;
    this.statusText = t('palette.connecting');
    this.statusClass = '';

    try {
      const result = await connectChannel('telegram', {
        token: tokenInput.value.trim(),
        userId: parsedId,
      });
      if (result.success) {
        this.statusText = `${t('palette.connectedTo')} @${result.botUsername}`;
        this.statusClass = 'success';
        setTimeout(() => this.loadBots(), 1000);
      } else {
        this.statusText = result.error ?? t('palette.connectionFailed');
        this.statusClass = 'error';
        this.submitting = false;
      }
    } catch {
      this.statusText = t('palette.connectionFailed');
      this.statusClass = 'error';
      this.submitting = false;
    }
  }

  private async handleDisconnect(nodeId: string) {
    if (!nodeId) return;
    await disconnectChannel('telegram', nodeId);
    this.loadBots();
  }

  private handleKeydown = (e: KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      this.dispatchEvent(new CustomEvent('panel-close', { bubbles: true }));
    } else if (e.key === 'Enter' && this.isValid() && !this.submitting) {
      e.preventDefault();
      this.handleSubmit(e);
    }
  };
}
