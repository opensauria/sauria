import { html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { LightDomElement } from '../shared/light-dom-element.js';
import type { ClientInfo } from './ipc.js';

@customElement('setup-step-done')
export class SetupStepDone extends LightDomElement {
  @property({ attribute: false }) clients: ClientInfo[] = [];

  override render() {
    return html`
      <div class="success-icon">&#10003;</div>
      <h1>Sauria is ready</h1>
      <p class="subtitle">Your AI provider is connected. Sauria is running in the background.</p>
      <ul class="client-list">
        ${this.clients.length > 0
          ? this.clients.map(
              (c) =>
                html`<li><span class="check">&#10003;</span> ${c.name} &mdash; configured</li>`,
            )
          : html`<li>No AI clients detected. Add Sauria manually in your client settings.</li>`}
      </ul>
      <div class="actions">
        <button class="btn btn-primary" @click=${this.handleDone}>Done</button>
      </div>
    `;
  }

  private handleDone() {
    this.dispatchEvent(new CustomEvent('setup-done', { bubbles: true }));
  }
}
