import { html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { LightDomElement } from '../shared/light-dom-element.js';
import { startOauth, completeOauth, openExternal } from './ipc.js';

const TITLES: Record<string, string> = {
  anthropic: 'Enter your Anthropic API key',
  openai: 'Enter your OpenAI API key',
  google: 'Enter your Google AI API key',
};

const HINTS: Record<string, string> = {
  anthropic: 'console.anthropic.com',
  openai: 'platform.openai.com/api-keys',
  google: 'aistudio.google.com/apikey',
};

const PLACEHOLDERS: Record<string, string> = {
  anthropic: 'sk-ant-...',
  openai: 'sk-...',
  google: 'AI...',
};

const URLS: Record<string, string> = {
  anthropic: 'https://console.anthropic.com/settings/keys',
  openai: 'https://platform.openai.com/api-keys',
  google: 'https://aistudio.google.com/apikey',
};

@customElement('setup-step-auth')
export class SetupStepAuth extends LightDomElement {
  @property() mode: 'claude_desktop' | 'api_key' = 'api_key';
  @property() provider = 'anthropic';
  @state() private oauthPhase: 'start' | 'code' | 'loading' = 'start';
  @state() private oauthError = '';
  @state() private oauthCodeError = '';
  @state() private apiKeyError = '';
  @state() private apiKeyValue = '';
  @state() private oauthCodeValue = '';

  override render() {
    if (this.mode === 'claude_desktop') return this.renderOAuth();
    return this.renderApiKey();
  }

  private renderOAuth() {
    return html`
      <h1>Sign in to Anthropic</h1>
      <p class="subtitle">
        Sauria will connect to your Anthropic account to use Claude as its AI engine. No API key
        needed.
      </p>

      ${this.oauthPhase === 'start'
        ? html`
            <div>
              <p class="oauth-steps">
                1. Click the button below to open Anthropic's login page<br />
                2. Log in and authorize Sauria<br />
                3. Copy the code shown on screen and paste it back here
              </p>
              ${this.oauthError
                ? html`<p class="error-msg visible" style="margin-top:16px">${this.oauthError}</p>`
                : nothing}
              <div class="actions">
                <button class="btn btn-secondary" @click=${this.handleBack}>Back</button>
                <button class="btn btn-primary" @click=${this.handleOAuthStart}>
                  Open Anthropic login
                </button>
              </div>
            </div>
          `
        : nothing}
      ${this.oauthPhase === 'code'
        ? html`
            <div>
              <p
                style="color:var(--text-secondary);font-size:var(--font-size-label);margin-bottom:16px"
              >
                A code is displayed in your browser. Copy it and paste it here.
              </p>
              <div class="input-group">
                <label for="oauth-code-input">Authorization code</label>
                <input
                  type="text"
                  id="oauth-code-input"
                  placeholder="Paste code here..."
                  .value=${this.oauthCodeValue}
                  @input=${this.handleOAuthCodeInput}
                />
              </div>
              ${this.oauthCodeError
                ? html`<p class="error-msg visible">${this.oauthCodeError}</p>`
                : nothing}
              <div class="actions">
                <button class="btn btn-secondary" @click=${this.resetOAuth}>Back</button>
                <button
                  class="btn btn-primary"
                  ?disabled=${this.oauthCodeValue.trim().length < 4}
                  @click=${this.handleOAuthSubmit}
                >
                  Connect
                </button>
              </div>
            </div>
          `
        : nothing}
      ${this.oauthPhase === 'loading'
        ? html`
            <div style="text-align:center;padding:32px 0">
              <div class="spinner"></div>
              <p style="color:var(--text-secondary);margin-top:16px">
                Connecting to your account...
              </p>
            </div>
          `
        : nothing}
    `;
  }

  private renderApiKey() {
    const title = TITLES[this.provider] ?? 'Enter your API key';
    const hint = HINTS[this.provider] ?? 'the provider console';
    const placeholder = PLACEHOLDERS[this.provider] ?? 'sk-...';

    return html`
      <h1>${title}</h1>
      <p class="subtitle">
        Your key is stored locally in an encrypted vault. It never leaves your machine.
      </p>
      <div class="input-group">
        <label for="api-key">API Key</label>
        <input
          type="password"
          id="api-key"
          placeholder="${placeholder}"
          .value=${this.apiKeyValue}
          @input=${this.handleApiKeyInput}
        />
        <p class="input-hint">
          Get your key from
          <a href="#" @click=${this.handleLinkClick}>${hint}</a>
        </p>
        ${this.apiKeyError ? html`<p class="error-msg visible">${this.apiKeyError}</p>` : nothing}
      </div>
      <div class="actions">
        <button class="btn btn-secondary" @click=${this.handleBack}>Back</button>
        <button
          class="btn btn-primary"
          ?disabled=${this.apiKeyValue.trim().length < 8}
          @click=${this.handleApiKeySubmit}
        >
          Continue
        </button>
      </div>
    `;
  }

  private handleBack() {
    this.dispatchEvent(new CustomEvent('step-back', { bubbles: true }));
  }

  private async handleOAuthStart() {
    this.oauthError = '';
    const result = await startOauth();
    if (result.started) {
      this.oauthPhase = 'code';
      this.oauthCodeValue = '';
      this.oauthCodeError = '';
      await this.updateComplete;
      this.querySelector<HTMLInputElement>('#oauth-code-input')?.focus();
    } else {
      this.oauthError = result.error ?? 'Could not start OAuth flow.';
    }
  }

  private handleOAuthCodeInput(e: Event) {
    this.oauthCodeValue = (e.target as HTMLInputElement).value;
    this.oauthCodeError = '';
  }

  private resetOAuth() {
    this.oauthPhase = 'start';
    this.oauthError = '';
    this.oauthCodeError = '';
    this.oauthCodeValue = '';
  }

  private async handleOAuthSubmit() {
    const code = this.oauthCodeValue.trim();
    if (!code) return;

    this.oauthPhase = 'loading';
    const result = await completeOauth(code);

    if (result.success) {
      this.dispatchEvent(
        new CustomEvent('auth-complete', {
          detail: { provider: 'anthropic', apiKey: '', mode: 'claude_desktop' },
          bubbles: true,
        }),
      );
    } else {
      this.oauthPhase = 'code';
      this.oauthCodeError = result.error ?? 'Token exchange failed. Please try again.';
    }
  }

  private handleApiKeyInput(e: Event) {
    this.apiKeyValue = (e.target as HTMLInputElement).value;
    this.apiKeyError = '';
  }

  private handleApiKeySubmit() {
    const apiKey = this.apiKeyValue.trim();
    this.dispatchEvent(
      new CustomEvent('auth-complete', {
        detail: { provider: this.provider, apiKey, mode: 'api_key' },
        bubbles: true,
      }),
    );
  }

  private handleLinkClick(e: Event) {
    e.preventDefault();
    const url = URLS[this.provider];
    if (url) openExternal(url);
  }

  showError(message: string) {
    this.apiKeyError = message;
  }
}
