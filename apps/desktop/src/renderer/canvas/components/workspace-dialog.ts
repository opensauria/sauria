import { html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { t } from '../../i18n.js';
import { generateId } from '../helpers.js';
import type { Workspace } from '../types.js';
import { PRESET_COLORS } from '../constants.js';
import { LightDomElement } from '../light-dom-element.js';

@customElement('workspace-dialog')
export class WorkspaceDialog extends LightDomElement {
  @property({ type: Boolean }) open = false;

  @state() private name = '';
  @state() private color = '#038B9A';
  @state() private purpose = '';
  @state() private topicsRaw = '';
  @state() private budget = '';

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

    this.name = '';
    this.color = '#038B9A';
    this.purpose = '';
    this.topicsRaw = '';
    this.budget = '';
  }

  render() {
    if (!this.open) return nothing;
    return html`
      <div class="ws-dialog-overlay open" @click=${this.handleOverlayClick}>
        <div class="ws-dialog">
          <h3>${t('canvas.newWorkspace')}</h3>
          <div class="ws-dialog-field">
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
          <div class="ws-dialog-field">
            <label>${t('canvas.color')}</label>
            <div class="ws-dialog-colors">
              ${PRESET_COLORS.map(
                (c) => html`
                  <div
                    class="ws-dialog-swatch ${this.color === c ? 'active' : ''}"
                    style="background: ${c}"
                    @click=${() => {
                      this.color = c;
                    }}
                  ></div>
                `,
              )}
            </div>
          </div>
          <div class="ws-dialog-field">
            <label>${t('canvas.purpose')}</label>
            <textarea
              .value=${this.purpose}
              @input=${(e: InputEvent) => {
                this.purpose = (e.target as HTMLTextAreaElement).value;
              }}
              placeholder=${t('canvas.workspacePurpose')}
            ></textarea>
          </div>
          <div class="ws-dialog-field">
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
          <div class="ws-dialog-field">
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
          <div class="ws-dialog-actions">
            <button class="ws-dialog-btn ws-dialog-btn-cancel" @click=${this.fireCancel}>
              ${t('common.cancel')}
            </button>
            <button class="ws-dialog-btn ws-dialog-btn-primary" @click=${this.handleSubmit}>
              ${t('canvas.create')}
            </button>
          </div>
        </div>
      </div>
    `;
  }
}
