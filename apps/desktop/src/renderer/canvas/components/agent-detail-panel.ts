import { html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { t } from '../../i18n.js';
import type { AgentNode, CanvasGraph, IntegrationDef } from '../types.js';
import { getInitials, capitalize } from '../helpers.js';
import { fire } from '../fire.js';
import { getAgentKpis } from '../ipc.js';
import { CEO_TEMPLATE, BOT_TEMPLATE } from '../constants.js';
import { LightDomElement } from '../light-dom-element.js';
import { adoptStyles } from '../../shared/styles/inject.js';
import { agentDetailStyles } from './agent-detail-styles.js';
import {
  renderRolePills,
  renderAutonomy,
  renderLanguage,
  renderBehavior,
  renderAiProvider,
  renderCodeMode,
  renderKpis,
  type KpiData,
} from './agent-detail-sections.js';
import './agent-integrations-section.js';

adoptStyles(agentDetailStyles);

const MIN_PANEL_WIDTH = 320;
const MAX_PANEL_WIDTH = 600;

@customElement('agent-detail-panel')
export class AgentDetailPanel extends LightDomElement {
  @property({ attribute: false }) node: AgentNode | null = null;
  @property({ attribute: false }) graph: CanvasGraph | null = null;
  @property({ attribute: false }) catalogMap = new Map<string, IntegrationDef>();

  @state() private kpis: KpiData | null = null;
  @state() private panelWidth = 400;
  @state() private isResizing = false;

  fireUpdate(patch: Partial<AgentNode>): void {
    fire(this, 'node-update', { nodeId: this.node?.id, patch });
  }

  private async loadKpis(nodeId: string): Promise<void> {
    try {
      const result = await getAgentKpis(nodeId);
      this.kpis = result as KpiData;
    } catch {
      this.kpis = null;
    }
  }

  updated(changed: Map<string, unknown>): void {
    if (changed.has('node') && this.node && this.node.platform !== 'owner') {
      this.loadKpis(this.node.id);
    }
  }

  render() {
    const { node } = this;
    const isOpen = node !== null;
    const isOwner = node?.platform === 'owner';

    return html`
      <div class="detail-panel ${isOpen ? 'open' : ''}" style="width: ${this.panelWidth}px">
        ${isOpen
          ? html`
              <div
                class="panel-resize-handle ${this.isResizing ? 'dragging' : ''}"
                @mousedown=${this.startResize}
              ></div>
            `
          : nothing}
        <div class="detail-header">
          <span class="detail-title"
            >${isOwner ? t('canvas.ownerSettings') : t('canvas.agentDetails')}</span
          >
          <button class="detail-close-btn" @click=${() => fire(this, 'close')}>
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
        ${node ? this.renderBody(node, isOwner!) : nothing}
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

  private renderBody(node: AgentNode, isOwner: boolean) {
    const displayName = isOwner ? node.label : node.meta.firstName || node.label.replace(/^@/, '');
    const handle = !isOwner && node.label.startsWith('@') ? node.label : '';
    const platformLabel = isOwner ? t('canvas.youOwner') : capitalize(node.platform);

    return html`
      <div class="detail-body">
        ${this.renderIdentity(node, isOwner, displayName, handle, platformLabel)}
        ${!isOwner ? renderRolePills(this, node) : nothing}
        ${!isOwner ? renderAutonomy(this, node) : nothing}
        ${!isOwner ? this.renderDescription(node) : nothing}
        ${this.renderInstructions(node, isOwner)}
        ${isOwner ? renderLanguage(this, this.graph?.language || 'auto') : nothing}
        ${!isOwner ? renderBehavior(this, node) : nothing}
        ${!isOwner ? renderAiProvider(this, node) : nothing}
        ${!isOwner ? renderCodeMode(this, node) : nothing}
        ${!isOwner ? renderKpis(this.kpis) : nothing}
        ${!isOwner
          ? html`
              <agent-integrations-section
                .node=${node}
                .graph=${this.graph}
                .catalogMap=${this.catalogMap}
              >
              </agent-integrations-section>
            `
          : nothing}
      </div>
    `;
  }

  private renderIdentity(
    node: AgentNode,
    isOwner: boolean,
    displayName: string,
    handle: string,
    platformLabel: string,
  ) {
    return html`
      <div class="detail-identity">
        <div class="detail-avatar ${isOwner ? 'owner-avatar' : ''}">
          ${node.photo
            ? html`<img src="${node.photo}" alt="" />`
            : isOwner
              ? html`<span class="detail-avatar-initials">${getInitials(node.label)}</span>`
              : html`<span></span>`}
        </div>
        <div>
          <div class="detail-agent-name">${displayName}</div>
          ${handle ? html`<div class="detail-agent-handle">${handle}</div>` : nothing}
          <div class="detail-agent-platform">${platformLabel}</div>
        </div>
      </div>
    `;
  }

  private renderDescription(node: AgentNode) {
    return html`
      <div class="detail-section">
        <span class="detail-label">${t('canvas.description')}</span>
        <input
          type="text"
          .value=${node.description || ''}
          @input=${(e: InputEvent) =>
            this.fireUpdate({
              description: (e.target as HTMLInputElement).value || undefined,
            })}
          placeholder=${t('canvas.descriptionPlaceholder')}
        />
      </div>
    `;
  }

  private renderInstructions(node: AgentNode, isOwner: boolean) {
    const label = isOwner ? t('canvas.commStyle') : t('canvas.agentPersona');
    const placeholder = isOwner
      ? t('canvas.commStylePlaceholder')
      : t('canvas.agentPersonaPlaceholder');
    const template = isOwner ? CEO_TEMPLATE : BOT_TEMPLATE;
    return html`
      <div class="detail-section">
        <span class="detail-label">${label}</span>
        <textarea
          .value=${node.instructions || ''}
          @input=${(e: InputEvent) =>
            this.fireUpdate({ instructions: (e.target as HTMLTextAreaElement).value })}
          placeholder=${placeholder}
        ></textarea>
        <button
          class="detail-template-btn"
          @click=${() => this.fireUpdate({ instructions: template })}
        >
          ${t('canvas.insertTemplate')}
        </button>
      </div>
    `;
  }
}
