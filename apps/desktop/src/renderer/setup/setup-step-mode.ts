import { html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { LightDomElement } from '../shared/light-dom-element.js';

@customElement('setup-step-mode')
export class SetupStepMode extends LightDomElement {
  @state() private selectedMode: string | null = null;

  override render() {
    return html`
      <h1>Choose your AI provider</h1>
      <p class="subtitle">Sauria needs an AI provider to work. How do you want to connect?</p>
      <div class="cards">
        ${this.renderCard(
          'claude_desktop',
          '/icons/anthropic.svg',
          'provider-icon',
          'I have a Claude subscription',
          'Connect with your Anthropic account',
          true,
        )}
        ${this.renderCard(
          'api_key',
          '/icons/settings.svg',
          'icon-mono',
          'I have an API key',
          'Anthropic, OpenAI, Google',
          false,
        )}
        ${this.renderCard(
          'local',
          '/icons/ollama.svg',
          'provider-icon',
          'I run models locally',
          'Ollama, LM Studio, Open WebUI',
          false,
        )}
      </div>
      <div class="actions">
        <button class="btn btn-secondary" @click=${this.handleBack}>Back</button>
        <button class="btn btn-primary" ?disabled=${!this.selectedMode} @click=${this.handleNext}>
          Continue
        </button>
      </div>
    `;
  }

  private renderCard(
    mode: string,
    iconSrc: string,
    iconClass: string,
    title: string,
    subtitle: string,
    isRecommended: boolean,
  ) {
    const isSelected = this.selectedMode === mode;
    return html`
      <div class="card ${isSelected ? 'selected' : ''}" @click=${() => (this.selectedMode = mode)}>
        <div class="card-icon">
          <img src="${iconSrc}" alt="" class="${iconClass}" />
        </div>
        <div class="card-info">
          <h3>${title}</h3>
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
    if (!this.selectedMode) return;
    this.dispatchEvent(
      new CustomEvent('mode-selected', {
        detail: { mode: this.selectedMode },
        bubbles: true,
      }),
    );
  }
}
