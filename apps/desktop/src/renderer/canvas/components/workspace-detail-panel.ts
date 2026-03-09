import { html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { t } from '../../i18n.js';
import type { Workspace } from '../types.js';
import { PRESET_COLORS } from '../constants.js';
import { fire } from '../fire.js';
import { LightDomElement } from '../light-dom-element.js';

const MIN_PANEL_WIDTH = 280;
const MAX_PANEL_WIDTH = 600;

@customElement('workspace-detail-panel')
export class WorkspaceDetailPanel extends LightDomElement {
  @property({ attribute: false }) workspace: Workspace | null = null;

  @state() private tagInput = '';
  @state() private panelWidth = 360;
  @state() private isResizing = false;

  private handleInput(field: string, value: string): void {
    fire(this, 'workspace-update', { field, value });
  }

  private handleColorClick(color: string): void {
    fire(this, 'workspace-update', { field: 'color', value: color });
  }

  private handleTagKeydown(e: KeyboardEvent): void {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const val = this.tagInput.trim();
    if (!val) return;
    fire(this, 'workspace-update', { field: 'addTopic', value: val });
    this.tagInput = '';
  }

  private handleRemoveTag(idx: number): void {
    fire(this, 'workspace-update', { field: 'removeTopic', value: idx });
  }

  private handleBudgetStep(delta: number): void {
    const ws = this.workspace;
    if (!ws) return;
    const next = Math.max(0, (ws.budget ?? 0) + delta);
    fire(this, 'workspace-update', { field: 'budget', value: String(next) });
  }

  render() {
    const ws = this.workspace;
    const isOpen = ws !== null;

    return html`
      <div class="ws-panel ${isOpen ? 'open' : ''}" style="width: ${this.panelWidth}px">
        ${isOpen
          ? html`
              <div
                class="panel-resize-handle ${this.isResizing ? 'dragging' : ''}"
                @mousedown=${this.startResize}
              ></div>
            `
          : nothing}
        <div class="ws-header">
          <span class="ws-title">${t('canvas.workspaceDetails')}</span>
          <button class="ws-close-btn" @click=${() => fire(this, 'close')}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
              <path
                d="M18 6L6 18M6 6l12 12"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
              />
            </svg>
          </button>
        </div>
        ${ws
          ? html`
              <div class="ws-body">
                <div class="ws-section">
                  <span class="ws-label">${t('canvas.name')}</span>
                  <input
                    type="text"
                    .value=${ws.name}
                    @input=${(e: InputEvent) =>
                      this.handleInput('name', (e.target as HTMLInputElement).value)}
                  />
                </div>
                <div class="ws-section">
                  <span class="ws-label">${t('canvas.color')}</span>
                  <div class="ws-colors">
                    ${PRESET_COLORS.map(
                      (c) => html`
                        <div
                          class="ws-swatch ${ws.color === c ? 'active' : ''}"
                          style="background: ${c}"
                          @click=${() => this.handleColorClick(c)}
                        ></div>
                      `,
                    )}
                  </div>
                </div>
                <div class="ws-section">
                  <span class="ws-label">${t('canvas.purpose')}</span>
                  <textarea
                    .value=${ws.purpose ?? ''}
                    @input=${(e: InputEvent) =>
                      this.handleInput('purpose', (e.target as HTMLTextAreaElement).value)}
                  ></textarea>
                </div>
                <div class="ws-section">
                  <span class="ws-label">${t('canvas.topics')}</span>
                  <div class="ws-tags">
                    ${(ws.topics ?? []).map(
                      (topic, idx) => html`
                        <span class="ws-tag">
                          ${topic}
                          <button class="ws-tag-remove" @click=${() => this.handleRemoveTag(idx)}>
                            x
                          </button>
                        </span>
                      `,
                    )}
                    <input
                      class="ws-tag-input"
                      type="text"
                      .value=${this.tagInput}
                      @input=${(e: InputEvent) => {
                        this.tagInput = (e.target as HTMLInputElement).value;
                      }}
                      @keydown=${this.handleTagKeydown}
                      placeholder=${t('canvas.addTopic')}
                    />
                  </div>
                </div>
                <div class="ws-section">
                  <span class="ws-label">${t('canvas.dailyBudget')}</span>
                  <div class="stepper">
                    <button class="stepper-btn" @click=${() => this.handleBudgetStep(-1)}>
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                      >
                        <line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                    </button>
                    <input
                      class="stepper-input"
                      type="number"
                      min="0"
                      step="1"
                      .value=${String(ws.budget ?? '')}
                      @input=${(e: InputEvent) =>
                        this.handleInput('budget', (e.target as HTMLInputElement).value)}
                    />
                    <button class="stepper-btn" @click=${() => this.handleBudgetStep(1)}>
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                      >
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            `
          : nothing}
      </div>
    `;
  }

  private startResize = (e: MouseEvent): void => {
    e.preventDefault();
    this.isResizing = true;
    const startX = e.clientX;
    const startWidth = this.panelWidth;

    const onMove = (ev: MouseEvent) => {
      const delta = startX - ev.clientX;
      this.panelWidth = Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, startWidth + delta));
    };

    const onUp = () => {
      this.isResizing = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };
}
