import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { t } from '../../i18n.js';
import { fire } from '../fire.js';

@customElement('canvas-toolbar')
export class CanvasToolbar extends LitElement {
  @property({ type: Number }) zoom = 1;
  @property({ type: Boolean }) dockHidden = true;
  @property({ type: Number }) unreadCount = 0;
  @property({ type: Boolean }) feedActive = false;

  static styles = css`
    :host {
      display: contents;
    }
    .canvas-toolbar {
      position: fixed;
      bottom: 16px;
      left: 16px;
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 4px;
      background: rgba(30, 30, 30, 0.9);
      border: 1px solid var(--border, rgba(255, 255, 255, 0.08));
      border-radius: var(--radius, 12px);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      z-index: 200;
      transition: bottom 0.3s ease;
    }
    :host([dock-hidden]) .canvas-toolbar {
      bottom: 16px;
    }
    .toolbar-group {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .toolbar-btn {
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      border: none;
      background: transparent;
      border-radius: var(--radius-sm, 8px);
      cursor: pointer;
      color: var(--text-secondary, #999);
      transition: background 0.15s ease;
    }
    .toolbar-btn:hover {
      background: rgba(255, 255, 255, 0.06);
    }
    .toolbar-btn img,
    .toolbar-btn svg {
      width: 16px;
      height: 16px;
      filter: brightness(0) invert();
      opacity: 0.5;
    }
    .toolbar-btn svg {
      filter: none;
      opacity: 1;
    }
    .zoom-display {
      min-width: 44px;
      text-align: center;
      font-size: 12px;
      color: var(--text-dim, #555);
      font-variant-numeric: tabular-nums;
    }
    .activity-btn {
      position: relative;
    }
    .activity-btn.active {
      background: rgba(3, 139, 154, 0.15);
    }
    .activity-badge {
      position: absolute;
      top: 2px;
      right: 2px;
      min-width: 16px;
      height: 16px;
      padding: 0 4px;
      border-radius: 8px;
      background: var(--error, #f87171);
      color: #fff;
      font-size: 10px;
      line-height: 16px;
      text-align: center;
      display: none;
    }
    .activity-badge.visible {
      display: block;
    }
  `;

  render() {
    const zoomPct = Math.round(this.zoom * 100) + '%';
    return html`
      <div class="canvas-toolbar">
        <div class="toolbar-group">
          <button class="toolbar-btn" title=${t('canvas.zoomOut')} @click=${() => fire(this, 'zoom-out')}>
            <img src="/icons/zoom-out.svg" alt="Zoom out" />
          </button>
          <span class="zoom-display">${zoomPct}</span>
          <button class="toolbar-btn" title=${t('canvas.zoomIn')} @click=${() => fire(this, 'zoom-in')}>
            <img src="/icons/zoom-in.svg" alt="Zoom in" />
          </button>
          <button class="toolbar-btn" title=${t('canvas.zoomReset')} @click=${() => fire(this, 'zoom-reset')}>
            <img src="/icons/maximize.svg" alt="Reset" />
          </button>
        </div>
        <button
          class="toolbar-btn activity-btn ${this.feedActive ? 'active' : ''}"
          title=${t('canvas.activityFeed')}
          @click=${() => fire(this, 'toggle-feed')}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <span class="activity-badge ${this.unreadCount > 0 ? 'visible' : ''}">
            ${this.unreadCount > 99 ? '99+' : this.unreadCount}
          </span>
        </button>
        <button class="toolbar-btn" title=${t('canvas.addWorkspace')} @click=${() => fire(this, 'add-workspace')}>
          <img src="/icons/square-plus.svg" alt="Add workspace" />
        </button>
      </div>
    `;
  }
}
