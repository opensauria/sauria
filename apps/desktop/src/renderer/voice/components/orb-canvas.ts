import { html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { LightDomElement } from '../../shared/light-dom-element.js';
import { generateParticles, type Particle } from './orb-particles.js';
import type { AssistantState } from '../types.js';
import { CANVAS_SIZE, FIELD_RADIUS } from '../constants.js';

const STATE_TOKEN: Record<AssistantState, string> = {
  idle: '--voice-orb-idle',
  recording: '--voice-orb-recording',
  processing: '--voice-orb-processing',
  playing: '--voice-orb-playing',
};

@customElement('voice-orb-canvas')
export class VoiceOrbCanvas extends LightDomElement {
  @property() state: AssistantState = 'idle';
  @property({ type: Array }) spectrumLevels: number[] = [];

  private canvas: HTMLCanvasElement | null = null;
  private rafId = 0;
  private startTime = 0;
  private readonly particles: readonly Particle[] = generateParticles();

  override connectedCallback(): void {
    super.connectedCallback();
    this.startTime = performance.now();
    this.scheduleFrame();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    cancelAnimationFrame(this.rafId);
  }

  override render() {
    return html`<canvas
      width=${CANVAS_SIZE * devicePixelRatio}
      height=${CANVAS_SIZE * devicePixelRatio}
      style="width:${CANVAS_SIZE}px;height:${CANVAS_SIZE}px;display:block;"
    ></canvas>`;
  }

  override updated(): void {
    this.canvas = this.querySelector('canvas');
  }

  private scheduleFrame(): void {
    this.rafId = requestAnimationFrame((ts) => {
      this.drawFrame(ts);
      this.scheduleFrame();
    });
  }

  private resolveColor(): string {
    const token = STATE_TOKEN[this.state];
    return getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  }

  private drawFrame(_ts: number): void {
    const canvas = this.canvas;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = devicePixelRatio;
    const size = CANVAS_SIZE * dpr;
    const t = (performance.now() - this.startTime) / 1000;
    const cx = size / 2;
    const cy = size / 2;

    ctx.clearRect(0, 0, size, size);
    ctx.globalCompositeOperation = 'lighter';

    const color = this.resolveColor();
    const levels = this.spectrumLevels;
    const avgLevel = levels.length > 0 ? levels.reduce((a, b) => a + b, 0) / levels.length : 0;
    const isActive = this.state === 'recording' || this.state === 'playing';
    const isProcessing = this.state === 'processing';

    for (const p of this.particles) {
      this.drawParticle(ctx, p, t, cx, cy, dpr, color, levels, avgLevel, isActive, isProcessing);
    }

    ctx.globalCompositeOperation = 'source-over';
  }

  private drawParticle(
    ctx: CanvasRenderingContext2D,
    p: Particle,
    t: number,
    cx: number,
    cy: number,
    dpr: number,
    color: string,
    levels: number[],
    avgLevel: number,
    isActive: boolean,
    isProcessing: boolean,
  ): void {
    const spec = levels.length > 0 ? (levels[p.band % levels.length] ?? 0) : 0;
    const { x, y, size: pSize, phase } = p;
    const dist = Math.sqrt(x * x + y * y);
    const nx = dist > 0.01 ? x / dist : 0;
    const ny = dist > 0.01 ? y / dist : 0;

    const floatSpeed = isActive ? 2.0 : isProcessing ? 0.7 : 0.4;
    const floatAmp = isActive ? 6 : isProcessing ? 4 : 3;
    const floatX = Math.sin(t * floatSpeed + phase) * floatAmp;
    const floatY = Math.cos(t * (floatSpeed * 0.9) + phase * 1.3) * floatAmp;

    const shakeAmt = spec * 45 + avgLevel * 18;
    const shakeX = Math.sin(t * 30 + phase * 7.3) * shakeAmt;
    const shakeY = Math.cos(t * 35 + phase * 5.7) * shakeAmt;

    const ripple = Math.sin(dist * 12 - t * 5 + phase * 0.5);
    const waveStrength = spec * 80 + avgLevel * 40;
    const waveX = nx * ripple * waveStrength;
    const waveY = ny * ripple * waveStrength;

    let breathX = 0;
    let breathY = 0;
    if (isProcessing) {
      const breathCycle = Math.sin(t * 1.8 + phase * 0.5);
      const breathAmt = breathCycle * 12 * dist;
      breathX = nx * breathAmt;
      breathY = ny * breathAmt;
      const pulse = Math.sin(dist * 18 - t * 4 + phase * 0.3);
      breathX += nx * pulse * 6;
      breathY += ny * pulse * 6;
    }

    const px = cx + (x * FIELD_RADIUS + floatX + waveX + shakeX + breathX) * dpr;
    const py = cy + (y * FIELD_RADIUS + floatY + waveY + shakeY + breathY) * dpr;

    const processingPulse = isProcessing ? 0.3 + 0.3 * Math.sin(t * 2.5 + phase) : 0;
    const s = pSize * (1 + spec * 4 + processingPulse) * dpr;

    const baseAlpha = 0.55 + (1 - dist) * 0.2;
    const specAlpha = spec * 0.6;
    const processingFlicker = isProcessing ? 0.15 * Math.sin(t * 3 + phase * 2) : 0;
    const alpha = Math.min(baseAlpha + specAlpha + processingFlicker, 1.0);

    if (s > 1.5 * dpr) {
      ctx.beginPath();
      ctx.ellipse(px, py, s * 2, s * 2, 0, 0, Math.PI * 2);
      ctx.fillStyle = colorWithAlpha(color, alpha * 0.15);
      ctx.fill();
    }

    ctx.beginPath();
    ctx.ellipse(px, py, s / 2, s / 2, 0, 0, Math.PI * 2);
    ctx.fillStyle = colorWithAlpha(color, alpha);
    ctx.fill();
  }
}

function colorWithAlpha(color: string, alpha: number): string {
  return `color-mix(in srgb, ${color} ${Math.round(alpha * 100)}%, transparent)`;
}
