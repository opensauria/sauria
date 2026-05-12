import type { AssistantState, ChatMessage, SidecarResponse } from '../types.js';
import { AudioController } from './audio-controller.js';
import { VADController } from './vad-controller.js';
import { AUTO_RECORD_DELAY_MS, TRANSCRIPTION_DELAY_MS } from '../constants.js';

export interface VoiceStateCallbacks {
  readonly onStateChange: (state: AssistantState) => void;
  readonly onSpectrumUpdate: (levels: Float32Array) => void;
  readonly onMessageAdd: (message: ChatMessage) => void;
  readonly onSendAudio: (wavBlob: Blob) => Promise<SidecarResponse>;
}

let messageIdCounter = 0;

function nextMessageId(): string {
  return `msg-${++messageIdCounter}`;
}

export class VoiceStateController {
  private state: AssistantState = 'idle';
  private isPaused = false;
  private readonly audio = new AudioController();
  private readonly vad = new VADController();
  private callbacks: VoiceStateCallbacks | null = null;
  private autoRecordTimer = 0;

  bind(callbacks: VoiceStateCallbacks): void {
    this.callbacks = callbacks;
  }

  getState(): AssistantState {
    return this.state;
  }

  getPaused(): boolean {
    return this.isPaused;
  }

  handleMicTap(): void {
    if (this.state === 'idle') {
      void this.startRecording();
    } else if (this.state === 'recording') {
      void this.stopAndSend();
    }
    // processing / playing: ignore tap
  }

  async startRecording(): Promise<void> {
    if (this.state !== 'idle') return;
    this.setState('recording');

    this.vad.start({
      onSilenceDetected: () => {
        void this.stopAndSend();
      },
    });

    try {
      await this.audio.startRecording({
        onSpectrumUpdate: (bands) => this.callbacks?.onSpectrumUpdate(bands),
        onRMSUpdate: (level) => this.vad.update(level),
      });
    } catch {
      this.addMessage('error', 'Microphone access required');
      this.vad.stop();
      this.setState('idle');
    }
  }

  private async stopAndSend(): Promise<void> {
    if (this.state !== 'recording') return;
    this.vad.stop();
    const wavBlob = this.audio.stopRecording();

    if (wavBlob === null) {
      this.addMessage('error', 'Failed to capture audio');
      this.setState('idle');
      return;
    }

    if (!this.vad.hadSpeech()) {
      this.addMessage('error', 'No speech detected');
      this.setState('idle');
      return;
    }

    this.setState('processing');

    try {
      const response = await this.callbacks!.onSendAudio(wavBlob);
      await this.handleResponse(response);
    } catch {
      this.addMessage('error', 'Connection failed');
      this.setState('idle');
    }
  }

  private async handleResponse(response: SidecarResponse): Promise<void> {
    if (response.transcription) {
      this.addMessage('user', response.transcription);
      await this.delay(TRANSCRIPTION_DELAY_MS);
    }

    this.addMessage('assistant', response.text);

    if (response.audio) {
      this.setState('playing');
      await new Promise<void>((resolve) => {
        void this.audio.playAudio(response.audio, {
          onSpectrumUpdate: (bands) => this.callbacks?.onSpectrumUpdate(bands),
          onPlaybackComplete: () => resolve(),
        });
      });
    }

    this.setState('idle');

    if (!this.isPaused) {
      this.autoRecordTimer = window.setTimeout(() => {
        if (this.state === 'idle' && !this.isPaused) {
          void this.startRecording();
        }
      }, AUTO_RECORD_DELAY_MS);
    }
  }

  cancelActivity(): void {
    window.clearTimeout(this.autoRecordTimer);
    if (this.state === 'recording') {
      this.vad.stop();
      this.audio.stopRecording();
    } else if (this.state === 'playing') {
      this.audio.stopPlayback();
    }
    this.setState('idle');
  }

  togglePause(): void {
    this.isPaused = !this.isPaused;
    if (this.isPaused && this.state === 'recording') {
      this.cancelActivity();
    }
  }

  reset(): void {
    window.clearTimeout(this.autoRecordTimer);
    this.audio.reset();
    this.vad.stop();
    this.setState('idle');
    this.isPaused = false;
  }

  destroy(): void {
    this.reset();
    this.audio.destroy();
    this.callbacks = null;
  }

  private setState(state: AssistantState): void {
    this.state = state;
    this.callbacks?.onStateChange(state);
  }

  private addMessage(role: 'user' | 'assistant' | 'error', text: string): void {
    this.callbacks?.onMessageAdd({ id: nextMessageId(), role, text });
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
