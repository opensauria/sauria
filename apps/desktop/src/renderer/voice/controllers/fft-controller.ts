import {
  BAND_COUNT,
  SMOOTHING_ATTACK,
  SMOOTHING_DECAY,
} from '../constants.js';

const FFT_SIZE = 4096;
const DB_FLOOR = -50;
const DB_RANGE = 50;

export class FFTController {
  private readonly analyser: AnalyserNode;
  private readonly frequencyData: Float32Array<ArrayBuffer>;
  private readonly smoothed: Float32Array<ArrayBuffer>;
  private readonly bandCount: number;

  constructor(audioContext: AudioContext, bandCount: number = BAND_COUNT) {
    this.bandCount = bandCount;
    this.analyser = audioContext.createAnalyser();
    this.analyser.fftSize = FFT_SIZE;
    this.analyser.smoothingTimeConstant = 0;
    this.frequencyData = new Float32Array(this.analyser.frequencyBinCount);
    this.smoothed = new Float32Array(bandCount);
  }

  get node(): AnalyserNode {
    return this.analyser;
  }

  /** Extract current spectrum as N normalized bands (0–1) with logarithmic spacing */
  getBands(): Float32Array {
    this.analyser.getFloatFrequencyData(this.frequencyData);
    const half = this.analyser.frequencyBinCount;

    for (let i = 0; i < this.bandCount; i++) {
      const lowRatio = Math.pow(i / this.bandCount, 2);
      const highRatio = Math.pow((i + 1) / this.bandCount, 2);
      const lowBin = Math.floor(lowRatio * half);
      const highBin = Math.max(lowBin + 1, Math.min(Math.floor(highRatio * half), half));

      let peak = -Infinity;
      for (let bin = lowBin; bin < highBin; bin++) {
        const value = this.frequencyData[bin];
        if (value !== undefined && value > peak) peak = value;
      }

      const normalized = Math.max(0, Math.min(1, (peak - DB_FLOOR) / DB_RANGE));
      const current = this.smoothed[i] ?? 0;
      const factor = normalized > current ? SMOOTHING_ATTACK : SMOOTHING_DECAY;
      this.smoothed[i] = current + (normalized - current) * factor;
    }

    return this.smoothed;
  }

  /** Get RMS level from time-domain data (0–1), used for VAD */
  getRMSLevel(): number {
    const timeData = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(timeData);

    let sum = 0;
    for (let i = 0; i < timeData.length; i++) {
      const sample = timeData[i] ?? 0;
      sum += sample * sample;
    }

    const rms = Math.sqrt(sum / timeData.length);
    const db = 20 * Math.log10(Math.max(rms, 1e-10));
    return Math.max(0, Math.min(1, (db - DB_FLOOR) / DB_RANGE));
  }

  reset(): void {
    this.smoothed.fill(0);
  }
}
