import { LitElement, html, css, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { t } from '../../i18n.js';
import type { AgentNode, CanvasGraph, IntegrationDef } from '../types.js';
import { getInitials, capitalize } from '../helpers.js';
import { fire } from '../fire.js';
import { getAgentKpis } from '../ipc.js';
import {
  renderRolePills,
  renderAutonomy,
  renderDescription,
  renderInstructions,
  renderLanguage,
  renderBehavior,
  renderKpis,
} from './agent-detail-sections.js';
import './agent-integrations-section.js';

@customElement('agent-detail-panel')
export class AgentDetailPanel extends LitElement {
  @property({ attribute: false }) node: AgentNode | null = null;
  @property({ attribute: false }) graph: CanvasGraph | null = null;
  @property({ attribute: false }) catalogMap = new Map<string, IntegrationDef>();

  @state() private kpis: {
    messagesHandled: number;
    tasksCompleted: number;
    avgResponseTimeMs: number;
    costUsd: number;
  } | null = null;

  static styles = css`
    :host {
      display: contents;
    }
    .panel {
      position: fixed;
      top: 0;
      right: 0;
      bottom: 0;
      width: 340px;
      max-width: 100%;
      background: var(--bg-solid);
      border-left: 1px solid var(--border);
      z-index: 100;
      transform: translateX(100%);
      transition: transform 0.2s ease;
      display: flex;
      flex-direction: column;
      overflow-y: auto;
    }
    .panel.open {
      transform: translateX(0);
    }
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px;
      border-bottom: 1px solid var(--border);
    }
    .title {
      font-size: 14px;
      font-weight: 500;
      color: var(--text);
    }
    .close-btn {
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: none;
      border: none;
      cursor: pointer;
      color: var(--text-secondary);
      border-radius: var(--radius-sm);
    }
    .close-btn:hover {
      background: var(--surface-hover);
    }
    .body {
      padding: 16px;
      flex: 1;
    }
    .section {
      margin-bottom: 16px;
    }
    .label {
      display: block;
      font-size: 12px;
      color: var(--text-secondary);
      margin-bottom: 4px;
    }
    .identity {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 16px;
    }
    .detail-avatar {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--surface);
    }
    .detail-avatar.owner-avatar {
      border: 2px solid var(--accent);
    }
    .detail-avatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .avatar-initials {
      font-size: 12px;
      color: var(--text);
    }
    .detail-agent-name {
      font-size: 14px;
      font-weight: 500;
      color: var(--text);
    }
    .detail-agent-handle {
      font-size: 12px;
      color: var(--text-dim);
    }
    .detail-agent-platform {
      font-size: 12px;
      color: var(--text-secondary);
    }
    .role-pills {
      display: flex;
      gap: 4px;
      flex-wrap: wrap;
    }
    .role-pill {
      padding: 4px 12px;
      border-radius: var(--radius-sm);
      background: var(--surface);
      border: 1px solid var(--border);
      color: var(--text-secondary);
      font-size: 12px;
      cursor: pointer;
    }
    .role-pill.active {
      background: var(--accent);
      color: var(--text-on-accent);
      border-color: var(--accent);
    }
    .autonomy-bar {
      display: flex;
      position: relative;
      background: var(--surface);
      border-radius: var(--radius-sm);
      overflow: hidden;
    }
    .autonomy-seg {
      flex: 1;
      padding: 8px 4px;
      text-align: center;
      cursor: pointer;
      font-size: 12px;
      color: var(--text-secondary);
      position: relative;
      z-index: 1;
    }
    .autonomy-seg.active {
      color: var(--text-on-accent);
    }
    .autonomy-highlight {
      position: absolute;
      top: 0;
      bottom: 0;
      background: var(--accent);
      border-radius: var(--radius-sm);
      transition:
        left 0.25s cubic-bezier(0.4, 0, 0.2, 1),
        width 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    }
    input,
    textarea,
    select {
      width: 100%;
      box-sizing: border-box;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 8px 12px;
      color: var(--text);
      font-size: 14px;
      outline: none;
    }
    textarea {
      resize: vertical;
      min-height: 80px;
    }
    input:focus,
    textarea:focus,
    select:focus {
      border-color: var(--accent);
    }
    select {
      appearance: auto;
    }
    .toggle-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
    }
    .toggle-label {
      font-size: 14px;
      color: var(--text-secondary);
    }
    .toggle-switch {
      width: 36px;
      height: 20px;
      border-radius: 10px;
      cursor: pointer;
      background: var(--surface);
      border: 1px solid var(--border);
      position: relative;
      transition: background 0.15s ease;
    }
    .toggle-switch.active {
      background: var(--accent);
      border-color: var(--accent);
    }
    .toggle-switch::after {
      content: '';
      position: absolute;
      top: 2px;
      left: 2px;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: var(--text-on-accent);
      transition: transform 0.15s ease;
    }
    .toggle-switch.active::after {
      transform: translateX(16px);
    }
    .kpi-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }
    .kpi-item {
      background: var(--surface);
      border-radius: var(--radius-sm);
      padding: 8px 12px;
    }
    .kpi-value {
      display: block;
      font-size: 16px;
      font-weight: 600;
      color: var(--text);
    }
    .kpi-label {
      display: block;
      font-size: 10px;
      color: var(--text-secondary);
    }
    .template-btn {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 4px 12px;
      color: var(--text-secondary);
      font-size: 12px;
      cursor: pointer;
      margin-top: 4px;
    }
    .template-btn:hover {
      background: var(--border);
    }
  `;

  private fireUpdate(patch: Partial<AgentNode>): void {
    fire(this, 'node-update', { nodeId: this.node?.id, patch });
  }

  private async loadKpis(nodeId: string): Promise<void> {
    try {
      const result = await getAgentKpis(nodeId);
      this.kpis = result as typeof this.kpis;
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
    const node = this.node;
    const isOpen = node !== null;
    const isOwner = node?.platform === 'owner';

    return html`
      <div class="panel ${isOpen ? 'open' : ''}">
        <div class="header">
          <span class="title"
            >${isOwner ? t('canvas.ownerSettings') : t('canvas.agentDetails')}</span
          >
          <button class="close-btn" @click=${() => fire(this, 'close')}>
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

  private renderBody(node: AgentNode, isOwner: boolean) {
    const displayName = isOwner ? node.label : node.meta.firstName || node.label.replace(/^@/, '');
    const handle = !isOwner && node.label.startsWith('@') ? node.label : '';
    const platformLabel = isOwner ? t('canvas.youOwner') : capitalize(node.platform);
    const update = (patch: Partial<AgentNode>) => this.fireUpdate(patch);
    const fireFn = (name: string, detail?: unknown) => fire(this, name, detail);

    return html`
      <div class="body">
        ${this.renderIdentity(node, isOwner, displayName, handle, platformLabel)}
        ${!isOwner ? renderRolePills(node, update) : nothing}
        ${!isOwner ? renderAutonomy(node, update) : nothing}
        ${!isOwner ? renderDescription(node, update) : nothing}
        ${renderInstructions(node, isOwner, update)}
        ${isOwner ? renderLanguage(this.graph?.language || 'auto', fireFn) : nothing}
        ${!isOwner ? renderBehavior(node, update) : nothing}
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
      <div class="identity">
        <div class="detail-avatar ${isOwner ? 'owner-avatar' : ''}">
          ${node.photo
            ? html`<img src="${node.photo}" alt="" />`
            : isOwner
              ? html`<span class="avatar-initials">${getInitials(node.label)}</span>`
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
}
