import { html, nothing } from 'lit';
import { LightDomElement } from '../light-dom-element.js';
import { customElement, property } from 'lit/decorators.js';
import type { AgentNode } from '../types.js';
import { PLATFORM_ICONS, getFieldsForPlatform } from '../constants.js';
import { escapeHtml, capitalize } from '../helpers.js';

/**
 * Setup / credential form rendered inside agent-card.
 * Light DOM to inherit canvas styles.
 */
@customElement('agent-card-setup')
export class AgentCardSetup extends LightDomElement {
  @property({ attribute: false }) node!: AgentNode;
  @property({ type: Boolean }) isConnecting = false;

  private fireAction(action: string): void {
    this.dispatchEvent(
      new CustomEvent('card-action', {
        bubbles: true,
        composed: true,
        detail: { action, nodeId: this.node.id },
      }),
    );
  }

  render() {
    const node = this.node;
    if (!node) return nothing;

    if (node._editing) return this.renderEditMode(node);
    if (node.platform === 'gmail') return this.renderGmail(node);
    return this.renderCredentialForm(node);
  }

  private renderGmail(node: AgentNode) {
    const statusHtml = this.getStatusHtml(node);
    return html`
      <div class="card-setup-header">
        <div class="cf-icon"></div>
        <span class="card-setup-title">Gmail</span>
        <button
          class="card-setup-close"
          data-action="cancel"
          @click=${() => this.fireAction('cancel')}
        >
          &times;
        </button>
      </div>
      <div class="card-setup-gmail-hint">
        Sign in securely with your Google account. No passwords stored.
      </div>
      ${statusHtml}
      <div class="card-setup-actions">
        <button
          class="btn-cancel"
          ?disabled=${this.isConnecting}
          @click=${() => this.fireAction('cancel')}
        >
          Cancel
        </button>
        <button
          class="btn-connect btn-google"
          ?disabled=${this.isConnecting}
          @click=${() => this.fireAction('connect')}
        >
          Sign in with Google
        </button>
      </div>
    `;
  }

  private renderCredentialForm(node: AgentNode) {
    const fields = getFieldsForPlatform(node.platform);
    const statusHtml = this.getStatusHtml(node);

    return html`
      <div class="card-setup-header">
        <div class="cf-icon"></div>
        <span class="card-setup-title">${capitalize(node.platform)}</span>
        <button
          class="card-setup-close"
          data-action="cancel"
          @click=${() => this.fireAction('cancel')}
        >
          &times;
        </button>
      </div>
      ${fields.map((f) => {
        const val = (node._formData && node._formData[f.key]) || '';
        return html`
          <div class="card-setup-field">
            <label>${f.label}</label>
            <input
              type=${f.type}
              data-field=${f.key}
              placeholder=${f.placeholder}
              .value=${val}
              ?disabled=${this.isConnecting}
              @input=${(e: InputEvent) => this.handleFieldInput(f.key, e)}
            />
            ${f.hint ? html`<div class="card-field-hint">${f.hint}</div>` : nothing}
          </div>
        `;
      })}
      ${statusHtml}
      <div class="card-setup-actions">
        <button
          class="btn-cancel"
          ?disabled=${this.isConnecting}
          @click=${() => this.fireAction('cancel')}
        >
          Cancel
        </button>
        <button
          class="btn-connect"
          ?disabled=${this.isConnecting}
          @click=${() => this.fireAction('connect')}
        >
          ${node.status === 'error' ? 'Retry' : 'Connect'}
        </button>
      </div>
    `;
  }

  private renderEditMode(node: AgentNode) {
    const displayName = node.meta.firstName || node.label.replace(/^@/, '');
    const fields = getFieldsForPlatform(node.platform);

    return html`
      <div class="card-setup-header">
        <div class="cf-icon"></div>
        <span class="card-setup-title">${displayName}</span>
        <button class="card-setup-close" @click=${() => this.fireAction('close-edit')}>
          &times;
        </button>
      </div>
      <div class="card-setup-field">
        <label>Role</label>
        <input
          type="text"
          data-field="description"
          placeholder="e.g. Customer support, Research..."
          .value=${node.description || ''}
          @input=${(e: InputEvent) => this.handleFieldInput('description', e)}
        />
      </div>
      ${fields.map(
        (f) => html`
          <div class="card-setup-field">
            <label>${f.label}</label>
            <input
              type="password"
              data-field=${f.key}
              placeholder=${f.placeholder}
              value="********"
              disabled
            />
          </div>
        `,
      )}
      <div class="card-setup-actions">
        <button class="btn-cancel" @click=${() => this.fireAction('disconnect')}>Disconnect</button>
        <button class="btn-connect" @click=${() => this.fireAction('close-edit')}>Done</button>
      </div>
    `;
  }

  private getStatusHtml(node: AgentNode) {
    if (this.isConnecting) {
      return html`<div class="card-setup-status info">
        <span class="card-spinner"></span>Connecting...
      </div>`;
    }
    if (node._statusMsg) {
      return html`<div class="card-setup-status ${node._statusType || ''}">
        ${node._statusMsg}
      </div>`;
    }
    return nothing;
  }

  private handleFieldInput(key: string, e: InputEvent): void {
    const node = this.node;
    if (!node._formData) node._formData = {};
    node._formData[key] = (e.target as HTMLInputElement).value;
  }

  updated(): void {
    /* Set platform icon via innerHTML */
    const iconEl = this.querySelector('.cf-icon');
    if (iconEl) {
      iconEl.innerHTML = PLATFORM_ICONS[this.node.platform] || '';
    }
  }
}
