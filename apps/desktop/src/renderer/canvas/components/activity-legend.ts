import { html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { t } from '../../i18n.js';
import { LightDomElement } from '../light-dom-element.js';

const LEGEND_FADE_MS = 10_000;

@customElement('canvas-legend')
export class CanvasLegend extends LightDomElement {
  @property({ type: Boolean }) visible = false;

  private hideTimer: ReturnType<typeof setTimeout> | null = null;

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
      <div class="canvas-legend ${this.visible ? 'visible' : ''}">
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
