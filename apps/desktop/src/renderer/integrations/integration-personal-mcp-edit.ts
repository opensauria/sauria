import { html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { LightDomElement } from '../shared/light-dom-element.js';
import { personalMcpUpdate, personalMcpDisconnect, personalMcpConnect } from '../shared/ipc.js';
import type { PersonalMcpEntry } from '../shared/types.js';
import { t } from '../i18n.js';

@customElement('integration-personal-mcp-edit')
export class IntegrationPersonalMcpEdit extends LightDomElement {
  @property({ attribute: false }) entry: PersonalMcpEntry | null = null;

  @state() private nameInput = '';
  @state() private commandInput = '';
  @state() private saving = false;
  @state() private refreshing = false;
  @state() private statusText = '';
  @state() private statusClass = '';

  override updated(changed: Map<string, unknown>) {
    if (changed.has('entry') && this.entry) {
      this.nameInput = this.entry.name;
      this.commandInput =
        this.entry.transport === 'stdio'
          ? `${this.entry.command ?? ''} ${(this.entry.args ?? []).join(' ')}`.trim()
          : (this.entry.url ?? '');
    }
  }

  override render() {
    if (!this.entry) return nothing;
    const { entry } = this;
    const isStdio = entry.transport === 'stdio';

    return html`
      <div class="ch-connect-section">
        <div class="form-group">
          <label class="form-label">${t('integ.mcpName')}</label>
          <input
            class="form-input"
            type="text"
            .value=${this.nameInput}
            @input=${(e: Event) => {
              this.nameInput = (e.target as HTMLInputElement).value;
            }}
          />
        </div>

        <div class="form-group">
          <label class="form-label">${isStdio ? t('integ.mcpCommand') : 'URL'}</label>
          <textarea
            class="form-input"
            rows="2"
            style="font-family:var(--font-family-mono);font-size:var(--font-size-small);resize:vertical;min-height:40px"
            .value=${this.commandInput}
            @input=${(e: Event) => {
              this.commandInput = (e.target as HTMLTextAreaElement).value;
            }}
          ></textarea>
        </div>

        <div class="form-group" style="display:flex;flex-direction:column;gap:var(--spacing-xs)">
          <span class="form-label">${t('integ.mcpInfo')}</span>
          <div style="display:flex;gap:var(--spacing-sm);flex-wrap:wrap">
            <span class="badge ${isStdio ? 'badge-accent' : 'badge-success'}"
              >${isStdio ? t('integ.mcpTransportStdio') : t('integ.mcpTransportRemote')}</span
            >
            <span class="badge badge-dim">${entry.connectedAt.split('T')[0]}</span>
          </div>
        </div>

        ${this.statusText
          ? html`<div class="form-status visible ${this.statusClass}">${this.statusText}</div>`
          : nothing}

        <div class="form-actions" style="display:flex;gap:var(--spacing-sm)">
          <button
            class="btn btn-primary"
            style="flex:1"
            ?disabled=${this.saving || this.refreshing || !this.isValid()}
            @click=${this.handleSave}
          >
            ${this.saving ? t('integ.saving') : t('integ.save')}
          </button>
          <button
            class="btn btn-secondary"
            ?disabled=${this.refreshing || this.saving}
            @click=${this.handleRefresh}
            title="${t('integ.refresh')}"
          >
            ${this.refreshing
              ? html`<span class="spinner-inline"></span>`
              : html`<img
                  class="icon-mono"
                  src="/icons/refresh-cw.svg"
                  alt=""
                  style="width:var(--spacing-md);height:var(--spacing-md)"
                />`}
          </button>
          <button
            class="btn btn-danger"
            ?disabled=${this.refreshing}
            @click=${this.handleDisconnect}
          >
            ${t('integ.disconnect')}
          </button>
        </div>
      </div>
    `;
  }

  private isValid(): boolean {
    return this.nameInput.trim().length > 0 && this.commandInput.trim().length > 0;
  }

  private async handleSave() {
    if (!this.entry || !this.isValid()) return;
    this.saving = true;
    this.statusText = '';

    const isStdio = this.entry.transport === 'stdio';
    const parts = this.commandInput.trim().split(/\s+/);

    try {
      await personalMcpUpdate({
        id: this.entry.id,
        name: this.nameInput.trim(),
        ...(isStdio
          ? { command: parts[0], args: parts.slice(1) }
          : { url: this.commandInput.trim() }),
      });
      this.statusText = t('integ.saved');
      this.statusClass = 'success';
      this.saving = false;
      this.dispatchEvent(new CustomEvent('personal-mcp-updated', { bubbles: true }));
    } catch (err: unknown) {
      this.statusText = err instanceof Error ? err.message : t('integ.saveFailed');
      this.statusClass = 'error';
      this.saving = false;
    }
  }

  private async handleRefresh() {
    if (!this.entry) return;
    this.refreshing = true;
    this.statusText = '';

    const { entry } = this;
    try {
      await personalMcpDisconnect(entry.id);

      const payload =
        entry.transport === 'stdio'
          ? {
              name: entry.name,
              transport: entry.transport,
              command: entry.command,
              args: [...entry.args],
              ...(entry.env ? { env: { ...entry.env } } : {}),
            }
          : {
              name: entry.name,
              transport: entry.transport,
              url: entry.url,
              ...(entry.accessToken ? { accessToken: entry.accessToken } : {}),
            };

      await personalMcpConnect(payload);
      this.statusText = t('integ.refresh');
      this.statusClass = 'success';
      this.dispatchEvent(new CustomEvent('personal-mcp-updated', { bubbles: true }));
    } catch (err: unknown) {
      this.statusText = err instanceof Error ? err.message : t('integ.saveFailed');
      this.statusClass = 'error';
    } finally {
      this.refreshing = false;
    }
  }

  private async handleDisconnect() {
    if (!this.entry) return;
    try {
      await personalMcpDisconnect(this.entry.id);
      this.dispatchEvent(new CustomEvent('personal-mcp-disconnected', { bubbles: true }));
    } catch (err: unknown) {
      this.statusText = err instanceof Error ? err.message : t('integ.disconnectFailed');
      this.statusClass = 'error';
    }
  }
}
