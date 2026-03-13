import { html, nothing, type TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { LightDomElement } from '../shared/light-dom-element.js';
import type { IntegrationStatus } from '../shared/types.js';
import { escapeHtml, formatLabel } from '../shared/utils.js';
import { trashIcon, plusIcon, loginIcon } from '../shared/icons.js';
import {
  integrationsConnect,
  integrationsDisconnect,
  integrationsConnectInstance,
  integrationsDisconnectInstance,
  integrationsListInstances,
  type ConnectedInstanceInfo,
} from './ipc.js';
import { startIntegrationOauth, startProxyOauth, getAuthProxyUrl } from './ipc.js';
import { t } from '../i18n.js';

import './integration-telegram-panel.js';
import './integration-slack-panel.js';

interface BotCardData {
  readonly iconPath: string;
  readonly label: string;
  readonly toolCount: number;
  readonly onDisconnect: () => void;
}

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
  @state() private instances: ConnectedInstanceInfo[] = [];
  @state() private showAddAccount = false;

  override updated(changed: Map<string, unknown>) {
    if (changed.has('item') && this.item?.connected) {
      void this.loadInstances();
    }
    if (changed.has('panelId')) {
      this.showAddAccount = false;
      this.instances = [];
    }
  }

  private async loadInstances() {
    if (!this.item) return;
    try {
      this.instances = await integrationsListInstances(this.item.id);
    } catch {
      this.instances = [];
    }
  }

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

  private renderBotCards(cards: readonly BotCardData[]): TemplateResult {
    return html`
      <div class="ch-bot-list">
        ${cards.map(
          (card) => html`
            <div class="ch-bot-card">
              <div class="ch-bot-avatar-placeholder">
                <img src="${card.iconPath}" alt="" />
              </div>
              <div class="ch-bot-info">
                <div class="ch-bot-name">${escapeHtml(card.label)}</div>
                <div class="ch-bot-status">
                  <span class="ch-bot-dot"></span>${card.toolCount} ${t('integ.tools')}
                </div>
              </div>
              <button
                class="ch-bot-disconnect"
                title="${t('integ.disconnect')}"
                ?disabled=${this.connecting}
                @click=${card.onDisconnect}
              >
                ${trashIcon()}
              </button>
            </div>
          `,
        )}
      </div>
    `;
  }

  private renderAddButton(): TemplateResult {
    return html`
      <button class="ch-add-card" @click=${() => (this.showAddAccount = true)}>
        ${plusIcon()}
        <span>${t('integ.addAccount')}</span>
      </button>
    `;
  }

  private renderToolsList(): TemplateResult | typeof nothing {
    const item = this.item!;
    const toolsList = item.tools.slice(0, 15);
    const remaining = item.tools.length - 15;

    return html`
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
    `;
  }

  private renderConnected() {
    const item = this.item!;

    if (this.showAddAccount) return this.renderAddAccountForm();

    if (this.instances.length > 1) return this.renderMultiInstance();

    const iconPath = `/icons/integrations/${item.definition.icon}.svg`;
    const label = this.accountLabel || item.definition.name;

    return html`
      ${this.renderBotCards([
        {
          iconPath,
          label,
          toolCount: item.tools.length,
          onDisconnect: () => this.handleDisconnect(),
        },
      ])}
      ${this.renderAddButton()} ${this.renderToolsList()}
    `;
  }

  private renderMultiInstance() {
    const item = this.item!;
    const iconPath = `/icons/integrations/${item.definition.icon}.svg`;

    const cards: BotCardData[] = this.instances.map((inst) => ({
      iconPath,
      label: inst.label,
      toolCount: inst.tools.length,
      onDisconnect: () => this.handleDisconnectInstance(inst.instanceId),
    }));

    return html`
      ${this.renderBotCards(cards)} ${this.renderAddButton()} ${this.renderToolsList()}
    `;
  }

  private renderAddAccountForm() {
    const { definition } = this.item!;

    return html`
      <div class="form-group">
        <label class="form-label">${t('integ.accountLabel')}</label>
        <input
          class="form-input"
          type="text"
          data-key="_label"
          placeholder="${t('integ.accountLabelPlaceholder')}"
          autocomplete="off"
        />
      </div>
      ${definition.credentialKeys.map(
        (key) => html`
          <div class="form-group">
            <label class="form-label">${formatLabel(key)}</label>
            <input
              class="form-input"
              type="${key.toLowerCase().includes('secret') || key.toLowerCase().includes('password')
                ? 'password'
                : 'text'}"
              data-key="${key}"
              placeholder="${t('integ.enter')} ${formatLabel(key)}"
              autocomplete="off"
            />
          </div>
        `,
      )}
      ${this.connectError ? html`<div class="config-error">${this.connectError}</div>` : nothing}
      <div class="form-actions">
        <button
          class="btn btn-primary"
          ?disabled=${this.connecting}
          @click=${this.handleAddAccountConnect}
        >
          ${this.connecting ? t('integ.connecting') : t('integ.connect')}
        </button>
        <button class="btn btn-secondary" @click=${() => (this.showAddAccount = false)}>
          ${t('integ.cancel')}
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
          <div class="form-group">
            <label class="form-label">${formatLabel(key)}</label>
            <input
              class="form-input"
              type="password"
              data-key="${key}"
              placeholder="${t('integ.enter')} ${formatLabel(key)}"
              autocomplete="off"
            />
          </div>
        `,
      )}
      <div class="form-actions">
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
        <div class="form-actions">
          <button
            class="btn btn-primary"
            ?disabled=${this.connecting}
            @click=${this.handleOAuthConnect}
          >
            ${loginIcon()} ${t('integ.connectWith').replace('{name}', definition.name)}
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
          <div class="form-actions">
            <button
              class="btn btn-primary"
              ?disabled=${this.connecting}
              @click=${this.handleOAuthConnect}
            >
              ${loginIcon()} ${t('integ.connectWith').replace('{name}', definition.name)}
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
            <div class="form-group">
              <label class="form-label">${formatLabel(key)}</label>
              <input
                class="form-input"
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
        <div class="form-actions">
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
    const inputs = Array.from(this.querySelectorAll<HTMLInputElement>('.form-input'));
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

  private async handleAddAccountConnect() {
    const labelInput = this.querySelector<HTMLInputElement>('.form-input[data-key="_label"]');
    const label = labelInput?.value.trim();
    if (!label) {
      if (labelInput) labelInput.style.borderColor = 'var(--error)';
      return;
    }

    const inputs = Array.from(
      this.querySelectorAll<HTMLInputElement>('.form-input:not([data-key="_label"])'),
    );
    const credentials: Record<string, string> = {};
    for (const input of inputs) {
      const key = input.dataset['key'];
      if (!key || !input.value.trim()) {
        input.style.borderColor = 'var(--error)';
        return;
      }
      credentials[key] = input.value.trim();
    }

    const slug = label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const instanceId = `${this.item!.id}:${slug}`;

    this.connecting = true;
    this.connectError = '';

    try {
      await integrationsConnectInstance({
        instanceId,
        integrationId: this.item!.id,
        label,
        credentials,
      });
      this.showAddAccount = false;
      this.fireRefresh();
    } catch (err: unknown) {
      this.connecting = false;
      this.connectError = err instanceof Error ? err.message : String(err);
    }
  }

  private async handleDisconnectInstance(instanceId: string) {
    this.connecting = true;
    try {
      await integrationsDisconnectInstance(instanceId);
      await this.loadInstances();
      if (this.instances.length === 0) {
        this.fireRefresh();
      } else {
        this.connecting = false;
      }
    } catch {
      this.connecting = false;
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
