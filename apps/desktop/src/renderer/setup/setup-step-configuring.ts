import { html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { LightDomElement } from '../shared/light-dom-element.js';
import { validateKey, configure, detectClients } from './ipc.js';

interface ProgressStep {
  readonly id: string;
  label: string;
  status: 'pending' | 'active' | 'done';
}

@customElement('setup-step-configuring')
export class SetupStepConfiguring extends LightDomElement {
  @property() provider = '';
  @property() apiKey = '';
  @property() mode = '';
  @property() localBaseUrl = '';
  @state() private steps: ProgressStep[] = [];

  override connectedCallback() {
    super.connectedCallback();
    this.steps = this.buildSteps();
    this.run();
  }

  override render() {
    return html`
      <h1>Setting everything up</h1>
      <p class="subtitle">This only takes a moment.</p>
      <ul class="progress-list">
        ${this.steps.map(
          (step) => html`
            <li class="progress-item ${step.status}">
              ${step.status === 'active'
                ? html`<div class="spinner"></div>`
                : step.status === 'done'
                  ? html`<div class="progress-dot">&#10003;</div>`
                  : html`<div class="progress-dot"></div>`}
              <span>${step.label}</span>
            </li>
          `,
        )}
      </ul>
    `;
  }

  private buildSteps(): ProgressStep[] {
    const verifyLabel =
      this.mode === 'claude_desktop'
        ? 'Account connected'
        : this.mode === 'local'
          ? 'Provider detected'
          : 'Validating credentials';

    const storeLabel =
      this.mode === 'local'
        ? 'Saving provider settings'
        : this.mode === 'claude_desktop'
          ? 'Securing tokens'
          : 'Encrypting credentials';

    return [
      { id: 'verify', label: verifyLabel, status: 'active' },
      { id: 'store', label: storeLabel, status: 'pending' },
      { id: 'config', label: 'Writing configuration', status: 'pending' },
      { id: 'clients', label: 'Connecting AI clients', status: 'pending' },
      { id: 'finish', label: 'Starting background service', status: 'pending' },
    ];
  }

  private async completeStep(index: number) {
    this.steps = this.steps.map((s, i) => {
      if (i === index) return { ...s, status: 'done' as const };
      if (i === index + 1) return { ...s, status: 'active' as const };
      return s;
    });
    await new Promise((r) => setTimeout(r, 400));
  }

  private async run() {
    try {
      if (this.mode === 'api_key' && this.apiKey) {
        const result = await validateKey(this.provider, this.apiKey);
        if (!result.valid) {
          this.dispatchEvent(
            new CustomEvent('config-error', {
              detail: { message: 'Invalid API key. Please check and try again.' },
              bubbles: true,
            }),
          );
          return;
        }
      }

      await this.completeStep(0);
      await this.completeStep(1);

      await configure({
        mode: this.mode,
        provider: this.provider,
        apiKey: this.apiKey,
        localBaseUrl: this.localBaseUrl,
      });

      await this.completeStep(2);
      await this.completeStep(3);
      await this.completeStep(4);

      await new Promise((r) => setTimeout(r, 500));

      const clients = await detectClients();
      const detected = clients.filter((c) => c.detected);

      this.dispatchEvent(
        new CustomEvent('config-complete', {
          detail: { clients: detected },
          bubbles: true,
        }),
      );
    } catch {
      this.dispatchEvent(
        new CustomEvent('config-error', {
          detail: { message: 'Something went wrong. Please try again.' },
          bubbles: true,
        }),
      );
    }
  }
}
