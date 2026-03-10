import { html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { LightDomElement } from '../shared/light-dom-element.js';
import type { IntegrationStatus } from '../shared/types.js';
import { escapeHtml, formatLabel } from '../shared/utils.js';
import { integrationsConnect, integrationsDisconnect } from './ipc.js';
import { startIntegrationOauth, startProxyOauth, getAuthProxyUrl } from './ipc.js';
import { t } from '../i18n.js';

import './integration-telegram-panel.js';
import './integration-slack-panel.js';

@customElement('integration-config-panel')
export class IntegrationConfigPanel extends LightDomElement {
  @property({ attribute: false }) item: IntegrationStatus | null = null;
  @property() panelId: string | null = null;
  @property() accountLabel = '';
  @state() private authMode: 'oauth' | 'apikey' = 'oauth';
  @state() private connecting = false;
  @state() private oauthStatus = '';
  @state() private oauthStatusClass = '';
  @state() private connectError = '';

  override render() {
    if (!this.panelId) return nothing;

    if (this.panelId === 'telegram') {
      return html`<integration-telegram-panel
        @telegram-status-change=${this.handleChannelChange}
      ></integration-telegram-panel>`;
    }

    if (this.panelId === 'slack') {
      return html`<integration-slack-panel
        @slack-status-change=${this.handleChannelChange}
      ></integration-slack-panel>`;
    }

    if (!this.item) return nothing;

    if (this.item.connected) return this.renderConnected();
    return this.renderConnectForm();
  }

  private renderConnected() {
    const item = this.item!;
    const toolsList = item.tools.slice(0, 15);
    const remaining = item.tools.length - 15;

    return html`
      ${this.accountLabel
        ? html`<div class="connected-account">
            <span class="connected-account-dot"></span>
            <span class="connected-account-label">${escapeHtml(this.accountLabel)}</span>
          </div>`
        : nothing}
      <div class="config-tools">
        <div class="config-tools-title">${t('integ.availableTools')} (${item.tools.length})</div>
        ${toolsList.map(
          (tool) => html`<div class="config-tool-item">${escapeHtml(tool.name)}</div>`,
        )}
        ${remaining > 0
          ? html`<div class="config-tool-item" style="color:var(--text-dim)">
              +${remaining} ${t('integ.more')}
            </div>`
          : nothing}
      </div>
      <div class="config-actions">
        <button
          class="btn btn-secondary"
          ?disabled=${this.connecting}
          @click=${this.handleDisconnect}
        >
          ${this.connecting ? t('integ.disconnecting') : t('integ.disconnect')}
        </button>
      </div>
    `;
  }

  private renderConnectForm() {
    const { definition } = this.item!;

    if (definition.authType === 'oauth') return this.renderOAuthForm();
    if (definition.authType === 'both') return this.renderBothForm();
    return this.renderApiKeyForm();
  }

  private renderApiKeyForm() {
    const { definition } = this.item!;

    return html`
      ${this.connectError ? html`<div class="config-error">${this.connectError}</div>` : nothing}
      ${definition.credentialKeys.map(
        (key) => html`
          <div class="config-field">
            <label class="config-label">${formatLabel(key)}</label>
            <input
              class="config-input"
              type="password"
              data-key="${key}"
              placeholder="${t('integ.enter')} ${formatLabel(key)}"
              autocomplete="off"
            />
          </div>
        `,
      )}
      <div class="config-actions">
        <button
          class="btn btn-primary"
          ?disabled=${this.connecting}
          @click=${this.handleApiKeyConnect}
        >
          ${this.connecting ? t('integ.connecting') : t('integ.connect')}
        </button>
      </div>
    `;
  }

  private renderOAuthForm() {
    const { definition } = this.item!;

    return html`
      ${this.item!.error ? html`<div class="config-error">${this.item!.error}</div>` : nothing}
      <div class="oauth-connect-section">
        <p class="oauth-description">
          ${t('integ.oauthDescription').replace('{name}', definition.name)}
        </p>
        <div class="config-actions">
          <button
            class="btn btn-primary"
            ?disabled=${this.connecting}
            @click=${this.handleOAuthConnect}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
              <polyline points="10 17 15 12 10 7" />
              <line x1="15" y1="12" x2="3" y2="12" />
            </svg>
            ${t('integ.connectWith').replace('{name}', definition.name)}
          </button>
        </div>
        ${this.oauthStatus
          ? html`<div class="form-status visible ${this.oauthStatusClass}">
              ${this.oauthStatus}
            </div>`
          : nothing}
      </div>
    `;
  }

  private renderBothForm() {
    const { definition } = this.item!;

    return html`
      ${this.item!.error ? html`<div class="config-error">${this.item!.error}</div>` : nothing}
      <div class="auth-toggle">
        <button
          class="auth-toggle-btn ${this.authMode === 'oauth' ? 'active' : ''}"
          @click=${() => (this.authMode = 'oauth')}
        >
          ${t('integ.oauthTab')}
        </button>
        <button
          class="auth-toggle-btn ${this.authMode === 'apikey' ? 'active' : ''}"
          @click=${() => (this.authMode = 'apikey')}
        >
          ${t('integ.apiKeyTab')}
        </button>
      </div>
      <div class="auth-mode-oauth" style="${this.authMode !== 'oauth' ? 'display:none' : ''}">
        <div class="oauth-connect-section">
          <p class="oauth-description">
            ${t('integ.oauthDescription').replace('{name}', definition.name)}
          </p>
          <div class="config-actions">
            <button
              class="btn btn-primary"
              ?disabled=${this.connecting}
              @click=${this.handleOAuthConnect}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                <polyline points="10 17 15 12 10 7" />
                <line x1="15" y1="12" x2="3" y2="12" />
              </svg>
              ${t('integ.connectWith').replace('{name}', definition.name)}
            </button>
          </div>
          ${this.oauthStatus
            ? html`<div class="form-status visible ${this.oauthStatusClass}">
                ${this.oauthStatus}
              </div>`
            : nothing}
        </div>
      </div>
      <div class="auth-mode-apikey" style="${this.authMode !== 'apikey' ? 'display:none' : ''}">
        ${definition.credentialKeys.map(
          (key) => html`
            <div class="config-field">
              <label class="config-label">${formatLabel(key)}</label>
              <input
                class="config-input"
                type="${key.toLowerCase().includes('secret') ||
                key.toLowerCase().includes('password')
                  ? 'password'
                  : 'text'}"
                data-key="${key}"
                placeholder="${t('integ.enter')} ${formatLabel(key)}"
                autocomplete="off"
              />
            </div>
          `,
        )}
        <div class="config-actions">
          <button
            class="btn btn-primary"
            ?disabled=${this.connecting}
            @click=${this.handleApiKeyConnect}
          >
            ${this.connecting ? t('integ.connecting') : t('integ.connect')}
          </button>
        </div>
      </div>
    `;
  }

  private async handleApiKeyConnect() {
    const inputs = Array.from(this.querySelectorAll<HTMLInputElement>('.config-input'));
    const credentials: Record<string, string> = {};
    for (const input of inputs) {
      const key = input.dataset['key'];
      if (!key || !input.value.trim()) {
        input.style.borderColor = 'var(--error)';
        return;
      }
      credentials[key] = input.value.trim();
    }

    this.connecting = true;
    this.connectError = '';

    try {
      await integrationsConnect(this.item!.id, credentials);
      this.fireRefresh();
    } catch (err: unknown) {
      this.connecting = false;
      this.connectError = err instanceof Error ? err.message : String(err);
    }
  }

  private async handleOAuthConnect() {
    const { mcpRemote, oauthProxy, name } = this.item!.definition;
    if (!mcpRemote && !oauthProxy) return;

    this.connecting = true;
    this.oauthStatus = t('integ.oauthWaiting');
    this.oauthStatusClass = '';

    try {
      if (mcpRemote) {
        await startIntegrationOauth({
          integrationId: this.item!.id,
          providerName: name,
          mcpUrl: mcpRemote.url,
          authUrl: mcpRemote.authorizationUrl ?? null,
          tokenUrl: mcpRemote.tokenUrl ?? null,
          scopes: null,
        });
      } else if (oauthProxy) {
        const proxyBase = await getAuthProxyUrl();
        await startProxyOauth({
          integrationId: this.item!.id,
          providerName: name,
          proxyUrl: proxyBase,
          providerKey: oauthProxy,
        });
      }
    } catch (err: unknown) {
      this.connecting = false;
      this.oauthStatus = err instanceof Error ? err.message : String(err);
      this.oauthStatusClass = 'error';
    }
  }

  private async handleDisconnect() {
    this.connecting = true;
    try {
      await integrationsDisconnect(this.item!.id);
      this.fireRefresh();
    } catch {
      this.connecting = false;
    }
  }

  setOAuthSuccess() {
    this.oauthStatus = t('integ.oauthSuccess');
    this.oauthStatusClass = 'success';
    this.connecting = false;
  }

  private handleChannelChange() {
    this.fireRefresh();
  }

  private fireRefresh() {
    this.dispatchEvent(new CustomEvent('config-refresh', { bubbles: true }));
  }
}
