import { html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { LightDomElement } from '../shared/light-dom-element.js';

@customElement('setup-step-provider')
export class SetupStepProvider extends LightDomElement {
  @state() private selectedProvider: string | null = null;

  override render() {
    return html`
      <h1>Choose your provider</h1>
      <p class="subtitle">Which AI provider do you have an API key for?</p>
      <div class="cards">
        ${this.renderCard(
          'anthropic',
          '/icons/anthropic.svg',
          'Anthropic',
          'Claude Sonnet, Opus',
          true,
        )}
        ${this.renderCard('openai', '/icons/openai.svg', 'OpenAI', 'GPT-4o, o1', false)}
        ${this.renderCard(
          'google',
          '/icons/google-ai.svg',
          'Google',
          'Gemini 2.5 Flash, Pro',
          false,
        )}
      </div>
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

  private renderCard(
    provider: string,
    iconSrc: string,
    name: string,
    subtitle: string,
    isRecommended: boolean,
  ) {
    const isSelected = this.selectedProvider === provider;
    return html`
      <div
        class="card ${isSelected ? 'selected' : ''}"
        @click=${() => (this.selectedProvider = provider)}
      >
        <div class="card-icon">
          <img src="${iconSrc}" alt="${name}" class="provider-icon" />
        </div>
        <div class="card-info">
          <h3>${name}</h3>
          <span>${subtitle}</span>
        </div>
        ${isRecommended ? html`<span class="badge badge-accent">Recommended</span>` : ''}
      </div>
    `;
  }

  private handleBack() {
    this.dispatchEvent(new CustomEvent('step-back', { bubbles: true }));
  }

  private handleNext() {
    if (!this.selectedProvider) return;
    this.dispatchEvent(
      new CustomEvent('provider-selected', {
        detail: { provider: this.selectedProvider },
        bubbles: true,
      }),
    );
  }
}
