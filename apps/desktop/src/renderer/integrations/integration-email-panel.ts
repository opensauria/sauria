import { html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { LightDomElement } from '../shared/light-dom-element.js';
import type { ChannelBot } from '../shared/types.js';
import { connectChannel, disconnectChannel, getEmailStatus } from '../shared/ipc.js';
import { trashIcon, plusIcon } from '../shared/icons.js';
import { t } from '../i18n.js';

@customElement('integration-email-panel')
export class IntegrationEmailPanel extends LightDomElement {
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
          <label class="form-label">${t('integ.emailImapHost')}</label>
          <input
            class="form-input"
            type="text"
            id="em-imap-host"
            placeholder="${t('integ.emailImapHostHint')}"
            autocomplete="off"
            @input=${this.validate}
          />
        </div>
        <div class="form-group">
          <label class="form-label">${t('integ.emailImapPort')}</label>
          <input
            class="form-input"
            type="number"
            id="em-imap-port"
            value="993"
            autocomplete="off"
          />
        </div>
        <div class="form-group">
          <label class="form-label">${t('integ.emailSmtpHost')}</label>
          <input
            class="form-input"
            type="text"
            id="em-smtp-host"
            placeholder="${t('integ.emailSmtpHostHint')}"
            autocomplete="off"
          />
        </div>
        <div class="form-group">
          <label class="form-label">${t('integ.emailSmtpPort')}</label>
          <input
            class="form-input"
            type="number"
            id="em-smtp-port"
            value="587"
            autocomplete="off"
          />
        </div>
        <div class="form-group">
          <label class="form-label">${t('integ.emailUsername')}</label>
          <input
            class="form-input"
            type="text"
            id="em-username"
            placeholder="${t('integ.emailUsernameHint')}"
            autocomplete="off"
            @input=${this.validate}
          />
        </div>
        <div class="form-group">
          <label class="form-label">${t('integ.emailPassword')}</label>
          <input
            class="form-input"
            type="password"
            id="em-password"
            placeholder="${t('integ.emailPasswordHint')}"
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
            ${t('integ.connect')}
          </button>
        </div>
      </div>
      ${connected.length > 0 && !this.showForm
        ? html`
            <button class="ch-add-card" @click=${() => (this.showForm = true)}>
              ${plusIcon()}
              <span>${t('integ.addAccount')}</span>
            </button>
          `
        : nothing}
    `;
  }

  private renderBotCard(bot: ChannelBot) {
    const name = bot.label || 'Email';

    return html`
      <div class="ch-bot-card">
        <div class="ch-bot-avatar-placeholder">
          <img src="/icons/integrations/gmail.svg" alt="" />
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
    const status = await getEmailStatus();
    this.bots = status.bots ?? [];
    this.fireStatusChange();
  }

  private getInput(id: string): HTMLInputElement | null {
    return this.querySelector<HTMLInputElement>(`#${id}`);
  }

  private isValid(): boolean {
    const imapHost = this.getInput('em-imap-host')?.value.trim() ?? '';
    const username = this.getInput('em-username')?.value.trim() ?? '';
    const password = this.getInput('em-password')?.value.trim() ?? '';
    return imapHost.length > 0 && username.length > 0 && password.length > 0;
  }

  private validate() {
    this.requestUpdate();
  }

  private async handleSubmit() {
    const imapHost = this.getInput('em-imap-host')?.value.trim() ?? '';
    const imapPort = parseInt(this.getInput('em-imap-port')?.value ?? '993', 10);
    const smtpHost = this.getInput('em-smtp-host')?.value.trim() || imapHost;
    const smtpPort = parseInt(this.getInput('em-smtp-port')?.value ?? '587', 10);
    const username = this.getInput('em-username')?.value.trim() ?? '';
    const password = this.getInput('em-password')?.value.trim() ?? '';

    this.submitting = true;
    this.statusText = t('integ.connecting');
    this.statusClass = '';

    try {
      const result = await connectChannel('email', {
        imapHost,
        imapPort,
        smtpHost,
        smtpPort,
        username,
        password,
      });
      if (result.success) {
        this.statusText = `${t('integ.connectedTo')} ${result.displayName ?? username}`;
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
    await disconnectChannel('email', nodeId);
    await this.loadBots();
  }

  private fireStatusChange() {
    this.showForm = false;
    this.submitting = false;
    this.statusText = '';
    this.statusClass = '';
    this.dispatchEvent(
      new CustomEvent('email-status-change', {
        detail: { bots: this.bots },
        bubbles: true,
      }),
    );
  }
}
