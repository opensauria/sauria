import { html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { LightDomElement } from '../shared/light-dom-element.js';
import type { TelegramBot } from '../shared/types.js';
import { connectChannel, disconnectChannel, getTelegramStatus } from '../shared/ipc.js';
import { t } from '../i18n.js';

const TG_ICON_SVG =
  '<svg viewBox="0 0 24 24"><path d="M9.04 15.6l-.39 5.36c.56 0 .8-.24 1.1-.52l2.63-2.5 5.45 3.97c1 .55 1.7.26 1.97-.92l3.57-16.67C23.71 2.7 22.85 2.14 21.9 2.5L1.4 10.17c-1.63.64-1.6 1.56-.28 1.98l5.1 1.58L19.5 5.8c.6-.38 1.15-.17.7.2L9.04 15.6z" fill="#27A7E7"/></svg>';
const TRASH_SVG =
  '<svg viewBox="0 0 24 24" fill="none"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

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
        <svg viewBox="0 0 24 24" fill="none">
          <path
            d="M12 5v14M5 12h14"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
          />
        </svg>
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
          ${photo ? html`<img src="${photo}" alt="" />` : html`${TG_ICON_SVG}`}
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
            ${TRASH_SVG}
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
