import { html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { LightDomElement } from '../shared/light-dom-element.js';
import type { ChannelBot } from '../shared/types.js';
import { connectChannel, disconnectChannel, getSlackStatus } from '../shared/ipc.js';
import { trashIcon, plusIcon } from '../shared/icons.js';
import { t } from '../i18n.js';

@customElement('integration-slack-panel')
export class IntegrationSlackPanel extends LightDomElement {
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
          <label class="form-label">${t('integ.slackOwnerId')}</label>
          <input
            class="form-input"
            type="text"
            id="sl-ownerid"
            placeholder="${t('integ.slackOwnerIdHint')}"
            autocomplete="off"
            @input=${this.validate}
          />
        </div>
        <div class="form-group">
          <label class="form-label">${t('integ.botToken')}</label>
          <input
            class="form-input"
            type="password"
            id="sl-token"
            placeholder="${t('integ.slackTokenHint')}"
            autocomplete="off"
            @input=${this.validate}
          />
        </div>
        <div class="form-group">
          <label class="form-label">${t('integ.slackSigningSecret')}</label>
          <input
            class="form-input"
            type="password"
            id="sl-signing"
            placeholder="${t('integ.slackSigningHint')}"
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
    const name = bot.label || 'Slack Bot';
    const subtitle = bot.teamName ? `· ${bot.teamName}` : '';

    return html`
      <div class="ch-bot-card">
        <div class="ch-bot-avatar-placeholder">
          <img src="/icons/integrations/slack.svg" alt="" />
        </div>
        <div class="ch-bot-info">
          <div class="ch-bot-name">${name} <span class="ch-bot-subtitle">${subtitle}</span></div>
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
    const status = await getSlackStatus();
    this.bots = status.bots ?? [];
    this.fireStatusChange();
  }

  private getOwnerIdInput(): HTMLInputElement | null {
    return this.querySelector<HTMLInputElement>('#sl-ownerid');
  }

  private getTokenInput(): HTMLInputElement | null {
    return this.querySelector<HTMLInputElement>('#sl-token');
  }

  private getSigningInput(): HTMLInputElement | null {
    return this.querySelector<HTMLInputElement>('#sl-signing');
  }

  private isValid(): boolean {
    const ownerId = this.getOwnerIdInput()?.value.trim() ?? '';
    const token = this.getTokenInput()?.value.trim() ?? '';
    const signing = this.getSigningInput()?.value.trim() ?? '';
    return token.length > 0 && signing.length > 0 && ownerId.length > 0;
  }

  private validate() {
    this.requestUpdate();
  }

  private async handleSubmit() {
    const ownerIdInput = this.getOwnerIdInput();
    const tokenInput = this.getTokenInput();
    const signingInput = this.getSigningInput();
    if (!ownerIdInput || !tokenInput || !signingInput) return;

    this.submitting = true;
    this.statusText = t('integ.connecting');
    this.statusClass = '';

    try {
      const result = await connectChannel('slack', {
        ownerId: ownerIdInput.value.trim(),
        token: tokenInput.value.trim(),
        signingSecret: signingInput.value.trim(),
      });
      if (result.success) {
        this.statusText = `${t('integ.connectedTo')} ${result.displayName ?? 'Slack'}`;
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
    await disconnectChannel('slack', nodeId);
    await this.loadBots();
  }

  private fireStatusChange() {
    this.showForm = false;
    this.submitting = false;
    this.statusText = '';
    this.statusClass = '';
    this.dispatchEvent(
      new CustomEvent('slack-status-change', {
        detail: { bots: this.bots },
        bubbles: true,
      }),
    );
  }
}
