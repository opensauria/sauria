import { LitElement, html, css, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { t } from '../../i18n.js';
import type { Workspace } from '../types.js';
import { PRESET_COLORS } from '../constants.js';
import { fire } from '../fire.js';

@customElement('workspace-detail-panel')
export class WorkspaceDetailPanel extends LitElement {
  @property({ attribute: false }) workspace: Workspace | null = null;

  @state() private tagInput = '';

  static styles = css`
    :host { display: contents; }
    .panel {
      position: fixed; top: 0; right: 0; bottom: 0;
      width: 320px; max-width: 100%;
      background: var(--bg, #1a1a1a);
      border-left: 1px solid var(--border, rgba(255,255,255,0.08));
      z-index: 100;
      transform: translateX(100%);
      transition: transform 0.2s ease;
      display: flex; flex-direction: column;
      overflow-y: auto;
    }
    .panel.open { transform: translateX(0); }
    .header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 16px; border-bottom: 1px solid var(--border);
    }
    .title { font-size: 14px; font-weight: 500; color: var(--text, #ececec); }
    .close-btn {
      width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;
      background: none; border: none; cursor: pointer; color: var(--text-secondary, #999);
      border-radius: var(--radius-sm, 8px);
    }
    .close-btn:hover { background: var(--surface-hover); }
    .body { padding: 16px; flex: 1; }
    .section { margin-bottom: 16px; }
    .label { display: block; font-size: 12px; color: var(--text-secondary); margin-bottom: 4px; }
    input, textarea {
      width: 100%; box-sizing: border-box;
      background: var(--surface, rgba(255,255,255,0.04));
      border: 1px solid var(--border); border-radius: var(--radius-sm, 8px);
      padding: 8px 12px; color: var(--text); font-size: 14px; outline: none;
    }
    textarea { resize: vertical; min-height: 60px; }
    input:focus, textarea:focus { border-color: var(--accent); }
    .colors { display: flex; gap: 8px; }
    .swatch { width: 24px; height: 24px; border-radius: 50%; border: 2px solid transparent; cursor: pointer; }
    .swatch.active { border-color: var(--text); }
    .tags { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
    .tag {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 2px 8px; background: var(--surface); border-radius: 4px; font-size: 12px; color: var(--text-secondary);
    }
    .tag-remove { background: none; border: none; color: var(--text-dim); cursor: pointer; font-size: 12px; padding: 0; }
    .tag-input { flex: 1; min-width: 80px; border: none; padding: 4px; background: transparent; color: var(--text); font-size: 12px; outline: none; }
    .stepper { display: flex; align-items: center; gap: 4px; }
    .stepper-btn {
      width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;
      background: var(--surface); border: 1px solid var(--border);
      border-radius: var(--radius-sm, 8px); cursor: pointer; color: var(--text-secondary);
    }
    .stepper-input { width: 60px; text-align: center; }
  `;

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
      <div class="panel ${isOpen ? 'open' : ''}">
        <div class="header">
          <span class="title">${t('canvas.workspaceDetails')}</span>
          <button class="close-btn" @click=${() => fire(this, 'close')}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
        ${ws
          ? html`
              <div class="body">
                <div class="section">
                  <span class="label">${t('canvas.name')}</span>
                  <input
                    type="text"
                    .value=${ws.name}
                    @input=${(e: InputEvent) => this.handleInput('name', (e.target as HTMLInputElement).value)}
                  />
                </div>
                <div class="section">
                  <span class="label">${t('canvas.color')}</span>
                  <div class="colors">
                    ${PRESET_COLORS.map(
                      (c) => html`
                        <div
                          class="swatch ${ws.color === c ? 'active' : ''}"
                          style="background: ${c}"
                          @click=${() => this.handleColorClick(c)}
                        ></div>
                      `,
                    )}
                  </div>
                </div>
                <div class="section">
                  <span class="label">${t('canvas.purpose')}</span>
                  <textarea
                    .value=${ws.purpose ?? ''}
                    @input=${(e: InputEvent) => this.handleInput('purpose', (e.target as HTMLTextAreaElement).value)}
                  ></textarea>
                </div>
                <div class="section">
                  <span class="label">${t('canvas.topics')}</span>
                  <div class="tags">
                    ${(ws.topics ?? []).map(
                      (topic, idx) => html`
                        <span class="tag">
                          ${topic}
                          <button class="tag-remove" @click=${() => this.handleRemoveTag(idx)}>x</button>
                        </span>
                      `,
                    )}
                    <input
                      class="tag-input"
                      type="text"
                      .value=${this.tagInput}
                      @input=${(e: InputEvent) => { this.tagInput = (e.target as HTMLInputElement).value; }}
                      @keydown=${this.handleTagKeydown}
                      placeholder=${t('canvas.addTopic')}
                    />
                  </div>
                </div>
                <div class="section">
                  <span class="label">${t('canvas.dailyBudget')}</span>
                  <div class="stepper">
                    <button class="stepper-btn" @click=${() => this.handleBudgetStep(-1)}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="5" y1="12" x2="19" y2="12"/>
                      </svg>
                    </button>
                    <input
                      class="stepper-input"
                      type="number"
                      min="0"
                      step="1"
                      .value=${String(ws.budget ?? '')}
                      @input=${(e: InputEvent) => this.handleInput('budget', (e.target as HTMLInputElement).value)}
                    />
                    <button class="stepper-btn" @click=${() => this.handleBudgetStep(1)}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
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
}
