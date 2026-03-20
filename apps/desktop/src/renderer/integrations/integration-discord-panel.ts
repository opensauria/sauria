import { html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { LightDomElement } from '../shared/light-dom-element.js';
import type { ChannelBot } from '../shared/types.js';
import { connectChannel, disconnectChannel, getDiscordStatus } from '../shared/ipc.js';
import { trashIcon, plusIcon } from '../shared/icons.js';
import { t } from '../i18n.js';

@customElement('integration-discord-panel')
export class IntegrationDiscordPanel extends LightDomElement {
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
          <label class="form-label">${t('integ.discordToken')}</label>
          <input
            class="form-input"
            type="password"
            id="dc-token"
            placeholder="${t('integ.discordTokenHint')}"
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

  private renderBotCard(bot: ChannelBot) {
    const name = bot.label || 'Discord Bot';

    return html`
      <div class="ch-bot-card">
        <div class="ch-bot-avatar-placeholder">
          <img src="/icons/integrations/discord.svg" alt="" />
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
    const status = await getDiscordStatus();
    this.bots = status.bots ?? [];
    this.fireStatusChange();
  }

  private getTokenInput(): HTMLInputElement | null {
    return this.querySelector<HTMLInputElement>('#dc-token');
  }

  private isValid(): boolean {
    return (this.getTokenInput()?.value.trim() ?? '').length > 0;
  }

  private validate() {
    this.requestUpdate();
  }

  private async handleSubmit() {
    const tokenInput = this.getTokenInput();
    if (!tokenInput) return;

    this.submitting = true;
    this.statusText = t('integ.connecting');
    this.statusClass = '';

    try {
      const result = await connectChannel('discord', {
        token: tokenInput.value.trim(),
      });
      if (result.success) {
        this.statusText = `${t('integ.connectedTo')} ${result.displayName ?? 'Discord'}`;
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
    await disconnectChannel('discord', nodeId);
    await this.loadBots();
  }

  private fireStatusChange() {
    this.showForm = false;
    this.submitting = false;
    this.statusText = '';
    this.statusClass = '';
    this.dispatchEvent(
      new CustomEvent('discord-status-change', {
        detail: { bots: this.bots },
        bubbles: true,
      }),
    );
  }
}
