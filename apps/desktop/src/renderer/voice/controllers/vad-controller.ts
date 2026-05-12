import {
  VAD_SILENCE_THRESHOLD,
  VAD_SILENCE_TIMEOUT_MS,
  VAD_MIN_RECORDING_MS,
  VAD_MIN_SPEECH_PEAK,
} from '../constants.js';

export interface VADCallbacks {
  readonly onSilenceDetected: () => void;
}

export class VADController {
  private silenceStart: number | null = null;
  private hasDetectedSpeech = false;
  private peakRMS = 0;
  private recordingStart = 0;
  private callbacks: VADCallbacks | null = null;

  start(callbacks: VADCallbacks): void {
    this.silenceStart = null;
    this.hasDetectedSpeech = false;
    this.peakRMS = 0;
    this.recordingStart = performance.now();
    this.callbacks = callbacks;
  }

  /** Call each frame with the current RMS level (0–1) */
  update(rmsLevel: number): void {
    if (this.callbacks === null) return;

    this.peakRMS = Math.max(this.peakRMS, rmsLevel);

    const elapsed = performance.now() - this.recordingStart;
    if (elapsed < VAD_MIN_RECORDING_MS) return;

    if (rmsLevel > VAD_SILENCE_THRESHOLD) {
      this.hasDetectedSpeech = true;
      this.silenceStart = null;
    } else if (this.hasDetectedSpeech) {
      if (this.silenceStart === null) {
        this.silenceStart = performance.now();
      } else if (performance.now() - this.silenceStart >= VAD_SILENCE_TIMEOUT_MS) {
        const cb = this.callbacks;
        this.callbacks = null; // prevent double-fire before calling
        cb.onSilenceDetected();
      }
    }
  }

  /** Returns true if meaningful speech was captured during the recording */
  hadSpeech(): boolean {
    return this.peakRMS >= VAD_MIN_SPEECH_PEAK;
  }

  stop(): void {
    this.callbacks = null;
  }
}
