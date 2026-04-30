import { FFTController } from './fft-controller.js';
import { encodeWAV, mergeChunks } from './wav-encoder.js';

const SCRIPT_PROCESSOR_BUFFER_SIZE = 4096;

export interface AudioControllerCallbacks {
  readonly onSpectrumUpdate?: (bands: Float32Array) => void;
  readonly onRMSUpdate?: (level: number) => void;
  readonly onPlaybackComplete?: () => void;
}

export class AudioController {
  private audioContext: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  private playerNode: AudioBufferSourceNode | null = null;
  private fft: FFTController | null = null;
  private chunks: Float32Array[] = [];
  private isRecording = false;
  private animFrameId = 0;
  private callbacks: AudioControllerCallbacks = {};

  /** Create AudioContext and FFTController. Must be called after a user gesture. */
  init(): void {
    if (this.audioContext !== null) return;
    this.audioContext = new AudioContext();
    this.fft = new FFTController(this.audioContext);
  }

  /** Start recording from the microphone */
  async startRecording(callbacks: AudioControllerCallbacks): Promise<void> {
    this.init();
    const ctx = this.audioContext!; // guaranteed by init()
    const fft = this.fft!;

    this.callbacks = callbacks;
    this.chunks = [];
    this.isRecording = true;

    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.sourceNode = ctx.createMediaStreamSource(this.stream);

    this.processorNode = ctx.createScriptProcessor(SCRIPT_PROCESSOR_BUFFER_SIZE, 1, 1);
    this.processorNode.onaudioprocess = (event) => {
      if (!this.isRecording) return;
      const input = event.inputBuffer.getChannelData(0);
      this.chunks.push(new Float32Array(input));
    };

    this.sourceNode.connect(fft.node);
    this.sourceNode.connect(this.processorNode);
    this.processorNode.connect(ctx.destination);

    this.startSpectrumLoop();
  }

  /** Stop recording and return a WAV Blob, or null if no audio was captured */
  stopRecording(): Blob | null {
    this.isRecording = false;
    this.stopSpectrumLoop();
    this.disconnectRecordingNodes();

    if (this.chunks.length === 0 || this.audioContext === null) return null;

    const merged = mergeChunks(this.chunks);
    this.chunks = [];
    return encodeWAV(merged, this.audioContext.sampleRate);
  }

  /** Play base64-encoded WAV audio through the FFT analyser for spectrum visualisation */
  async playAudio(base64Audio: string, callbacks: AudioControllerCallbacks): Promise<void> {
    this.init();
    const ctx = this.audioContext!;
    const fft = this.fft!;

    this.stopPlayback();
    this.callbacks = callbacks;

    const binary = atob(base64Audio);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    const audioBuffer = await ctx.decodeAudioData(bytes.buffer);

    this.playerNode = ctx.createBufferSource();
    this.playerNode.buffer = audioBuffer;
    this.playerNode.connect(fft.node);
    fft.node.connect(ctx.destination);

    this.playerNode.onended = () => {
      this.stopSpectrumLoop();
      fft.reset();
      this.playerNode = null;
      this.callbacks.onPlaybackComplete?.();
    };

    this.playerNode.start();
    this.startSpectrumLoop();
  }

  /** Stop current playback immediately */
  stopPlayback(): void {
    if (this.playerNode !== null) {
      this.playerNode.onended = null;
      this.playerNode.stop();
      this.playerNode.disconnect();
      this.playerNode = null;
    }
    this.stopSpectrumLoop();
  }

  /** Stop all activity and clear recorded data */
  reset(): void {
    this.stopPlayback();
    this.isRecording = false;
    this.disconnectRecordingNodes();
    this.chunks = [];
    this.fft?.reset();
    this.callbacks = {};
  }

  /** Release all Web Audio resources */
  destroy(): void {
    this.reset();
    this.audioContext?.close();
    this.audioContext = null;
    this.fft = null;
  }

  private startSpectrumLoop(): void {
    const tick = () => {
      if (this.fft === null) return;
      this.callbacks.onSpectrumUpdate?.(this.fft.getBands());
      this.callbacks.onRMSUpdate?.(this.fft.getRMSLevel());
      this.animFrameId = requestAnimationFrame(tick);
    };
    this.animFrameId = requestAnimationFrame(tick);
  }

  private stopSpectrumLoop(): void {
    if (this.animFrameId !== 0) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = 0;
    }
  }

  private disconnectRecordingNodes(): void {
    this.processorNode?.disconnect();
    this.processorNode = null;
    this.sourceNode?.disconnect();
    this.sourceNode = null;
    if (this.stream !== null) {
      for (const track of this.stream.getTracks()) track.stop();
      this.stream = null;
    }
  }
}
