import { html } from 'lit';
import { customElement } from 'lit/decorators.js';
import { LightDomElement } from '../shared/light-dom-element.js';

@customElement('setup-step-welcome')
export class SetupStepWelcome extends LightDomElement {
  override render() {
    return html`
      <div class="brand">Sauria</div>
      <h1>Your world, always with you.</h1>
      <p class="subtitle">
        Sauria connects to your AI tools and makes them smarter. It builds a private knowledge graph
        from your data and shares context across your apps.
      </p>
      <p class="subtitle">Setup takes about 30 seconds.</p>
      <div class="actions">
        <button class="btn btn-primary" @click=${this.handleStart}>Get started</button>
      </div>
    `;
  }

  private handleStart() {
    this.dispatchEvent(new CustomEvent('step-next', { bubbles: true }));
  }
}
