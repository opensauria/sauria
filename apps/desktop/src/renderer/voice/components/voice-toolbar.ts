import { html, type TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { LightDomElement } from '../../shared/light-dom-element.js';
import type { AssistantState } from '../types.js';

@customElement('voice-toolbar')
export class VoiceToolbar extends LightDomElement {
  @property({ type: String }) state: AssistantState = 'idle';
  @property({ type: Boolean }) isPaused = false;
  @state() private isSettingsOpen = false;

  private handleMicTap(): void {
    this.dispatchEvent(new CustomEvent('voice-mic-tap', { bubbles: true, composed: true }));
  }

  private handlePauseToggle(): void {
    this.dispatchEvent(new CustomEvent('voice-pause-toggle', { bubbles: true, composed: true }));
  }

  private handleClearHistory(): void {
    this.dispatchEvent(new CustomEvent('voice-clear-history', { bubbles: true, composed: true }));
    this.isSettingsOpen = false;
  }

  private openSettings(): void {
    this.isSettingsOpen = true;
  }

  private closeSettings(): void {
    this.isSettingsOpen = false;
  }

  override render(): TemplateResult {
    return this.isSettingsOpen ? this.renderSettings() : this.renderDefault();
  }

  private renderDefault(): TemplateResult {
    const isDisabled = this.state === 'processing' || this.state === 'playing';
    const isRecording = this.state === 'recording';
    const micIcon = isRecording ? 'square' : 'mic';
    const micClass = `voice-toolbar__btn voice-toolbar__mic${isRecording ? ' voice-toolbar__mic--recording' : ''}`;

    return html`
      <div class="voice-toolbar">
        <button class=${micClass} ?disabled=${isDisabled} @click=${this.handleMicTap}>
          <img
            class="voice-toolbar__icon"
            src="/icons/${micIcon}.svg"
            alt=${isRecording ? 'Stop' : 'Start recording'}
          />
        </button>
        <button class="voice-toolbar__btn" @click=${this.openSettings}>
          <img class="voice-toolbar__icon" src="/icons/settings.svg" alt="Settings" />
        </button>
      </div>
    `;
  }

  private renderSettings(): TemplateResult {
    const pauseIcon = this.isPaused ? 'mic-off' : 'mic';
    const pauseLabel = this.isPaused ? 'Resume mic' : 'Pause mic';

    return html`
      <div class="voice-toolbar__settings">
        <button class="voice-toolbar__settings-btn" @click=${this.handlePauseToggle}>
          <img class="voice-toolbar__icon" src="/icons/${pauseIcon}.svg" alt=${pauseLabel} />
        </button>
        <button class="voice-toolbar__settings-btn" @click=${this.handleClearHistory}>
          <img class="voice-toolbar__icon" src="/icons/trash-2.svg" alt="Clear history" />
        </button>
        <button
          class="voice-toolbar__settings-btn voice-toolbar__settings-close"
          @click=${this.closeSettings}
        >
          <img class="voice-toolbar__icon" src="/icons/x.svg" alt="Close settings" />
        </button>
      </div>
    `;
  }
}
