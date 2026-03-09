import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { t } from '../../i18n.js';

const LEGEND_FADE_MS = 10_000;

@customElement('canvas-legend')
export class CanvasLegend extends LitElement {
  @property({ type: Boolean }) visible = false;

  private hideTimer: ReturnType<typeof setTimeout> | null = null;

  static styles = css`
    :host {
      display: contents;
    }
    .legend {
      position: fixed;
      top: 16px;
      right: 16px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 12px 16px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      z-index: 50;
      opacity: 0;
      transform: translateY(-8px);
      pointer-events: none;
      transition:
        opacity 0.3s ease,
        transform 0.3s ease;
    }
    .legend.visible {
      opacity: 1;
      transform: translateY(0);
      pointer-events: auto;
    }
    .legend-item {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      color: var(--text-secondary);
    }
    .legend-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--accent);
      box-shadow: 0 0 6px var(--accent);
    }
    .legend-ring {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      border: 2px solid var(--accent);
      box-shadow: 0 0 6px var(--accent);
    }
  `;

  updated(changed: Map<string, unknown>): void {
    if (changed.has('visible') && this.visible) {
      if (this.hideTimer) clearTimeout(this.hideTimer);
      this.hideTimer = setTimeout(() => {
        this.visible = false;
        this.hideTimer = null;
      }, LEGEND_FADE_MS);
    }
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this.hideTimer) clearTimeout(this.hideTimer);
  }

  render() {
    return html`
      <div class="legend ${this.visible ? 'visible' : ''}">
        <div class="legend-item">
          <span class="legend-dot"></span>
          <span>${t('canvas.messageInTransit')}</span>
        </div>
        <div class="legend-item">
          <span class="legend-ring"></span>
          <span>${t('canvas.agentProcessing')}</span>
        </div>
      </div>
    `;
  }
}
