import { html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { t } from '../../i18n.js';
import { fire } from '../fire.js';
import { LightDomElement } from '../light-dom-element.js';

@customElement('canvas-toolbar')
export class CanvasToolbar extends LightDomElement {
  @property({ type: Number }) zoom = 1;
  @property({ type: Boolean }) dockHidden = true;
  @property({ type: Number }) unreadCount = 0;
  @property({ type: Boolean }) feedActive = false;
  @property({ type: Boolean }) refreshing = false;

  render() {
    const zoomPct = Math.round(this.zoom * 100) + '%';
    return html`
      <div class="canvas-toolbar">
        <div class="toolbar-group">
          <button
            class="toolbar-btn"
            title=${t('canvas.zoomOut')}
            @click=${() => fire(this, 'zoom-out')}
          >
            <img src="/icons/zoom-out.svg" alt="Zoom out" />
          </button>
          <span class="zoom-display">${zoomPct}</span>
          <button
            class="toolbar-btn"
            title=${t('canvas.zoomIn')}
            @click=${() => fire(this, 'zoom-in')}
          >
            <img src="/icons/zoom-in.svg" alt="Zoom in" />
          </button>
          <button
            class="toolbar-btn"
            title=${t('canvas.zoomReset')}
            @click=${() => fire(this, 'zoom-reset')}
          >
            <img src="/icons/maximize.svg" alt="Reset" />
          </button>
        </div>
        <button
          class="toolbar-btn ${this.refreshing ? 'spinning' : ''}"
          title=${t('canvas.refreshProfiles')}
          @click=${() => fire(this, 'refresh-profiles')}
        >
          <img src="/icons/refresh-cw.svg" alt="Refresh" />
        </button>
        <button
          class="toolbar-btn activity-btn ${this.feedActive ? 'active' : ''}"
          title=${t('canvas.activityFeed')}
          @click=${() => fire(this, 'toggle-feed')}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <span class="activity-badge ${this.unreadCount > 0 ? 'visible' : ''}">
            ${this.unreadCount > 99 ? '99+' : this.unreadCount}
          </span>
        </button>
        <button
          class="toolbar-btn"
          title=${t('canvas.addWorkspace')}
          @click=${() => fire(this, 'add-workspace')}
        >
          <img src="/icons/square-plus.svg" alt="Add workspace" />
        </button>
      </div>
    `;
  }
}
