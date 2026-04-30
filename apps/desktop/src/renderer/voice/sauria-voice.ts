import { html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { LightDomElement } from '../shared/light-dom-element.js';
import { adoptGlobalStyles, adoptStyles } from '../shared/styles/inject.js';
import { voiceLayoutStyles, voiceChatStyles, voiceToolbarStyles } from './styles/index.js';
import type { AssistantState, ChatMessage, SidecarAction, SidecarResponse } from './types.js';
import { VoiceStateController } from './controllers/voice-state-controller.js';
import { SidecarClient } from './controllers/sidecar-client.js';
import { getVoiceConfig } from './ipc.js';
import { invoke } from '@tauri-apps/api/core';
import { emit } from '@tauri-apps/api/event';
import { FADE_OUT_DURATION_MS, SHOW_RECORD_DELAY_MS } from './constants.js';

adoptGlobalStyles();
adoptStyles(voiceLayoutStyles, voiceChatStyles, voiceToolbarStyles);

import './components/orb-canvas.js';
import './components/chat-feed.js';
import './components/chat-bubble.js';
import './components/voice-toolbar.js';

@customElement('sauria-voice')
export class SauriaVoice extends LightDomElement {
  @state() private isVisible = false;
  @state() private isHiding = false;
  @state() private assistantState: AssistantState = 'idle';
  @state() private spectrumLevels: number[] = [];
  @state() private messages: ChatMessage[] = [];
  @state() private isPaused = false;

  private readonly voiceCtrl = new VoiceStateController();
  private readonly sidecarClient = new SidecarClient();
  private showRecordTimer = 0;

  override connectedCallback(): void {
    super.connectedCallback();
    this.voiceCtrl.bind({
      onStateChange: (s) => {
        this.assistantState = s;
      },
      onSpectrumUpdate: (levels) => {
        this.spectrumLevels = Array.from(levels);
      },
      onMessageAdd: (msg) => {
        this.messages = [...this.messages, msg];
      },
      onSendAudio: (blob) => this.sendAudioToSidecar(blob),
    });
    getVoiceConfig()
      .then((config) => {
        this.sidecarClient.configure(config.port, config.token);
      })
      .catch(() => {
        /* sidecar not available yet */
      });
    document.addEventListener('keydown', this.handleKeydown);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.voiceCtrl.destroy();
    document.removeEventListener('keydown', this.handleKeydown);
    window.clearTimeout(this.showRecordTimer);
  }

  // --- Public API ---

  toggle(): void {
    if (this.isVisible) {
      if (this.assistantState === 'idle') {
        void this.voiceCtrl.startRecording();
      }
    } else {
      this.show();
    }
  }

  show(): void {
    this.isVisible = true;
    this.isHiding = false;
    this.showRecordTimer = window.setTimeout(() => {
      this.voiceCtrl.handleMicTap();
    }, SHOW_RECORD_DELAY_MS);
  }

  hide(): void {
    window.clearTimeout(this.showRecordTimer);
    this.voiceCtrl.cancelActivity();
    this.isHiding = true;
    setTimeout(() => {
      this.isVisible = false;
      this.isHiding = false;
      this.messages = [];
      this.spectrumLevels = [];
      this.voiceCtrl.reset();
      void emit('voice-hide', {});
    }, FADE_OUT_DURATION_MS);
  }

  // --- Event handlers ---

  private readonly handleKeydown = (e: KeyboardEvent): void => {
    if (!this.isVisible) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      if (this.assistantState === 'idle') {
        this.hide();
      } else {
        this.voiceCtrl.cancelActivity();
      }
      return;
    }

    const isInput =
      e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
    if (e.key === ' ' && !isInput) {
      e.preventDefault();
      if (this.assistantState === 'recording') {
        this.voiceCtrl.cancelActivity();
      } else if (this.assistantState === 'idle') {
        this.voiceCtrl.handleMicTap();
      }
    }
  };

  private handleOverlayClick(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    if (target.classList.contains('voice-overlay') && this.assistantState === 'idle') {
      this.hide();
    }
  }

  private handleMicTap(): void {
    this.voiceCtrl.handleMicTap();
  }

  private handlePauseToggle(): void {
    this.voiceCtrl.togglePause();
    this.isPaused = this.voiceCtrl.getPaused();
  }

  private handleClearHistory(): void {
    this.messages = [];
    this.sidecarClient.clearHistory().catch(() => {});
  }

  // --- Sidecar integration ---

  private async sendAudioToSidecar(blob: Blob): Promise<SidecarResponse> {
    const response = await this.sidecarClient.sendAudio(blob);
    this.executeActions(response.actions);
    return response;
  }

  private executeActions(actions: readonly SidecarAction[]): void {
    for (const action of actions) {
      switch (action.type) {
        case 'navigate_view':
          void invoke('navigate_palette_to', { view: action.params['view'] });
          break;
        case 'instruct_agent':
          void invoke('execute_owner_command', {
            command: JSON.stringify({
              type: 'instruct',
              agentName: action.params['agent_name'],
              instruction: action.params['instruction'],
            }),
          });
          break;
      }
    }
  }

  // --- Render ---

  override render() {
    if (!this.isVisible && !this.isHiding) return html``;

    const overlayClass = [
      'voice-overlay',
      this.isVisible && !this.isHiding ? 'voice-overlay--visible' : '',
      this.isHiding ? 'voice-overlay--hiding' : '',
    ]
      .filter(Boolean)
      .join(' ');

    const glowClass = `voice-glow voice-glow--${this.assistantState}`;

    return html`
      <div class=${overlayClass} @click=${this.handleOverlayClick}>
        <div class="voice-content">
          <div class="voice-orb">
            <div class="voice-backdrop"></div>
            <div class=${glowClass}></div>
            <voice-orb-canvas
              .state=${this.assistantState}
              .spectrumLevels=${this.spectrumLevels}
            ></voice-orb-canvas>
          </div>

          <voice-chat-feed .messages=${this.messages}></voice-chat-feed>

          <div class="voice-spacer"></div>

          <voice-toolbar
            .state=${this.assistantState}
            .isPaused=${this.isPaused}
            @voice-mic-tap=${this.handleMicTap}
            @voice-pause-toggle=${this.handlePauseToggle}
            @voice-clear-history=${this.handleClearHistory}
          ></voice-toolbar>
        </div>
      </div>
    `;
  }
}
