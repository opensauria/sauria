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
  @state() private budgetValue = 0;

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
    const budgetVal = this.budgetValue;

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
    this.budgetValue = 0;
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
            <div class="stepper">
              <button
                class="stepper-btn"
                @click=${() => {
                  this.budgetValue = Math.max(0, this.budgetValue - 1);
                }}
              >
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
                .value=${String(this.budgetValue)}
                @input=${(e: InputEvent) => {
                  this.budgetValue = Math.max(
                    0,
                    parseInt((e.target as HTMLInputElement).value) || 0,
                  );
                }}
              />
              <button
                class="stepper-btn"
                @click=${() => {
                  this.budgetValue = this.budgetValue + 1;
                }}
              >
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
