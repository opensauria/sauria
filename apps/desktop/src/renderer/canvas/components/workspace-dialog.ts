import { LitElement, html, css, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { t } from '../../i18n.js';
import { generateId } from '../helpers.js';
import type { Workspace } from '../types.js';
import { PRESET_COLORS } from '../constants.js';

@customElement('workspace-dialog')
export class WorkspaceDialog extends LitElement {
  @property({ type: Boolean }) open = false;

  @state() private name = '';
  @state() private color = '#038B9A';
  @state() private purpose = '';
  @state() private topicsRaw = '';
  @state() private budget = '';

  static styles = css`
    :host {
      display: contents;
    }
    .overlay {
      position: fixed;
      inset: 0;
      background: var(--overlay, rgba(0, 0, 0, 0.5));
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 200;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.15s ease;
    }
    .overlay.open {
      opacity: 1;
      pointer-events: auto;
    }
    .dialog {
      background: var(--bg, #1a1a1a);
      border: 1px solid var(--border, rgba(255, 255, 255, 0.08));
      border-radius: var(--radius, 12px);
      padding: 24px;
      width: 380px;
      max-width: 90%;
    }
    h3 {
      margin: 0 0 16px;
      font-size: 16px;
      color: var(--text, #ececec);
    }
    .field {
      margin-bottom: 12px;
    }
    label {
      display: block;
      font-size: 12px;
      color: var(--text-secondary, #999);
      margin-bottom: 4px;
    }
    input,
    textarea {
      width: 100%;
      box-sizing: border-box;
      background: var(--surface, rgba(255, 255, 255, 0.04));
      border: 1px solid var(--border, rgba(255, 255, 255, 0.08));
      border-radius: var(--radius-sm, 8px);
      padding: 8px 12px;
      color: var(--text, #ececec);
      font-size: 14px;
      outline: none;
    }
    textarea {
      resize: vertical;
      min-height: 60px;
    }
    input:focus,
    textarea:focus {
      border-color: var(--accent, #038b9a);
    }
    .colors {
      display: flex;
      gap: 8px;
      margin-bottom: 12px;
    }
    .swatch {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      border: 2px solid transparent;
      cursor: pointer;
      transition: border-color 0.15s ease;
    }
    .swatch.active {
      border-color: var(--text, #ececec);
    }
    .actions {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
      margin-top: 16px;
    }
    button {
      padding: 8px 16px;
      border: none;
      border-radius: var(--radius-sm, 8px);
      font-size: 14px;
      cursor: pointer;
      transition: background 0.15s ease;
    }
    .btn-cancel {
      background: var(--surface);
      color: var(--text-secondary);
    }
    .btn-cancel:hover {
      background: rgba(255, 255, 255, 0.08);
    }
    .btn-primary {
      background: var(--accent, #038b9a);
      color: #fff;
    }
    .btn-primary:hover {
      background: var(--accent-hover, #027a87);
    }
  `;

  private handleOverlayClick(e: MouseEvent): void {
    if (e.target === e.currentTarget) this.fireCancel();
  }

  private fireCancel(): void {
    this.dispatchEvent(new CustomEvent('cancel', { bubbles: true, composed: true }));
  }

  private handleSubmit(): void {
    if (!this.name.trim()) return;
    const topics = this.topicsRaw
      ? this.topicsRaw
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
    const budgetVal = parseFloat(this.budget) || 0;

    const detail: Omit<Workspace, 'position' | 'size'> & {
      position?: undefined;
      size?: undefined;
    } = {
      id: generateId(),
      name: this.name.trim(),
      color: this.color,
      purpose: this.purpose.trim(),
      topics,
      budget: budgetVal,
      checkpoints: [],
      groups: [],
    };

    this.dispatchEvent(
      new CustomEvent('workspace-create', {
        bubbles: true,
        composed: true,
        detail,
      }),
    );

    /* Reset form */
    this.name = '';
    this.color = '#038B9A';
    this.purpose = '';
    this.topicsRaw = '';
    this.budget = '';
  }

  render() {
    if (!this.open) return nothing;
    return html`
      <div class="overlay open" @click=${this.handleOverlayClick}>
        <div class="dialog">
          <h3>${t('canvas.newWorkspace')}</h3>
          <div class="field">
            <label>${t('canvas.name')}</label>
            <input
              type="text"
              .value=${this.name}
              @input=${(e: InputEvent) => {
                this.name = (e.target as HTMLInputElement).value;
              }}
              placeholder=${t('canvas.egMarketing')}
            />
          </div>
          <div class="field">
            <label>${t('canvas.color')}</label>
            <div class="colors">
              ${PRESET_COLORS.map(
                (c) => html`
                  <div
                    class="swatch ${this.color === c ? 'active' : ''}"
                    style="background: ${c}"
                    @click=${() => {
                      this.color = c;
                    }}
                  ></div>
                `,
              )}
            </div>
          </div>
          <div class="field">
            <label>${t('canvas.purpose')}</label>
            <textarea
              .value=${this.purpose}
              @input=${(e: InputEvent) => {
                this.purpose = (e.target as HTMLTextAreaElement).value;
              }}
              placeholder=${t('canvas.workspacePurpose')}
            ></textarea>
          </div>
          <div class="field">
            <label>${t('canvas.topics')}</label>
            <input
              type="text"
              .value=${this.topicsRaw}
              @input=${(e: InputEvent) => {
                this.topicsRaw = (e.target as HTMLInputElement).value;
              }}
              placeholder=${t('canvas.commaSeparated')}
            />
          </div>
          <div class="field">
            <label>${t('canvas.dailyBudget')}</label>
            <input
              type="number"
              min="0"
              step="1"
              .value=${this.budget}
              @input=${(e: InputEvent) => {
                this.budget = (e.target as HTMLInputElement).value;
              }}
              placeholder="0"
            />
          </div>
          <div class="actions">
            <button class="btn-cancel" @click=${this.fireCancel}>${t('common.cancel')}</button>
            <button class="btn-primary" @click=${this.handleSubmit}>${t('canvas.create')}</button>
          </div>
        </div>
      </div>
    `;
  }
}
