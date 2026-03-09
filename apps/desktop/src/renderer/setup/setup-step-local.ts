import { html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { LightDomElement } from '../shared/light-dom-element.js';
import { detectLocalProviders, type LocalProvider } from './ipc.js';

@customElement('setup-step-local')
export class SetupStepLocal extends LightDomElement {
  @state() private scanning = true;
  @state() private running: LocalProvider[] = [];
  @state() private selectedProvider: string | null = null;
  @state() private selectedUrl = '';

  override connectedCallback() {
    super.connectedCallback();
    this.scan();
  }

  override render() {
    return html`
      <h1>Local AI providers</h1>
      <p class="subtitle">${this.getSubtitle()}</p>

      ${this.scanning
        ? html`
            <div class="scan-status">
              <div class="spinner"></div>
              <p>Looking for Ollama, LM Studio, Open WebUI...</p>
            </div>
          `
        : nothing}
      ${!this.scanning && this.running.length > 0
        ? html` <div class="cards">${this.running.map((p) => this.renderProviderCard(p))}</div> `
        : nothing}
      ${!this.scanning && this.running.length === 0
        ? html`
            <div class="cards">
              ${this.renderManualCard(
                'ollama',
                'http://localhost:11434',
                'O',
                'Ollama',
                'localhost:11434',
              )}
              ${this.renderManualCard(
                'lm-studio',
                'http://localhost:1234',
                'L',
                'LM Studio',
                'localhost:1234',
              )}
              ${this.renderManualCard(
                'open-webui',
                'http://localhost:3000',
                'W',
                'Open WebUI',
                'localhost:3000',
              )}
            </div>
          `
        : nothing}

      <div class="actions">
        <button class="btn btn-secondary" @click=${this.handleBack}>Back</button>
        <button
          class="btn btn-primary"
          ?disabled=${!this.selectedProvider}
          @click=${this.handleNext}
        >
          Continue
        </button>
      </div>
    `;
  }

  private renderProviderCard(p: LocalProvider) {
    const providerId = p.name.toLowerCase().replace(/\s+/g, '-');
    const isSelected = this.selectedProvider === providerId;
    return html`
      <div
        class="card ${isSelected ? 'selected' : ''}"
        @click=${() => this.selectProvider(providerId, p.baseUrl)}
      >
        <div class="card-icon">${p.name[0]}</div>
        <div class="card-info">
          <h3>${p.name}</h3>
          <span>${p.baseUrl}</span>
        </div>
        <span class="badge badge-success">Running</span>
      </div>
    `;
  }

  private renderManualCard(
    provider: string,
    url: string,
    initial: string,
    name: string,
    subtitle: string,
  ) {
    const isSelected = this.selectedProvider === provider;
    return html`
      <div
        class="card ${isSelected ? 'selected' : ''}"
        @click=${() => this.selectProvider(provider, url)}
      >
        <div class="card-icon">${initial}</div>
        <div class="card-info">
          <h3>${name}</h3>
          <span>${subtitle}</span>
        </div>
      </div>
    `;
  }

  private getSubtitle(): string {
    if (this.scanning) return 'Scanning your machine for running AI providers...';
    if (this.running.length > 0) {
      return `Found ${this.running.length} running provider${this.running.length > 1 ? 's' : ''}.`;
    }
    return 'No running provider detected. Select which one you will use.';
  }

  private async scan() {
    const providers = await detectLocalProviders();
    this.running = providers.filter((p) => p.running);
    this.scanning = false;

    if (this.running.length === 1) {
      const p = this.running[0]!;
      this.selectProvider(p.name.toLowerCase().replace(/\s+/g, '-'), p.baseUrl);
    }
  }

  private selectProvider(provider: string, url: string) {
    this.selectedProvider = provider;
    this.selectedUrl = url;
  }

  private handleBack() {
    this.dispatchEvent(new CustomEvent('step-back', { bubbles: true }));
  }

  private handleNext() {
    if (!this.selectedProvider) return;
    this.dispatchEvent(
      new CustomEvent('local-selected', {
        detail: { provider: this.selectedProvider, url: this.selectedUrl },
        bubbles: true,
      }),
    );
  }
}
