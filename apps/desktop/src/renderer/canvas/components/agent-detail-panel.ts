import { LitElement, html, css, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { t } from '../../i18n.js';
import type { AgentNode, CanvasGraph, IntegrationDef } from '../types.js';
import { PLATFORM_ICONS, RESPONSE_LANGUAGES, CEO_TEMPLATE, BOT_TEMPLATE } from '../constants.js';
import { escapeHtml, getInitials, capitalize } from '../helpers.js';
import { getAgentKpis, assignIntegration, unassignIntegration } from '../ipc.js';

const ROLES = ['lead', 'specialist', 'observer', 'coordinator', 'assistant'] as const;
const AUTONOMY_LEVELS = [
  { level: 0, label: 'Manual' },
  { level: 1, label: 'Supervised' },
  { level: 2, label: 'Guided' },
  { level: 3, label: 'Full' },
] as const;

@customElement('agent-detail-panel')
export class AgentDetailPanel extends LitElement {
  @property({ attribute: false }) node: AgentNode | null = null;
  @property({ attribute: false }) graph: CanvasGraph | null = null;
  @property({ attribute: false }) catalogMap = new Map<string, IntegrationDef>();

  @state() private kpis: { messagesHandled: number; tasksCompleted: number; avgResponseTimeMs: number; costUsd: number } | null = null;
  @state() private showIntDropdown = false;
  @state() private intSearchFilter = '';

  static styles = css`
    :host { display: contents; }
    .panel {
      position: fixed; top: 0; right: 0; bottom: 0;
      width: 340px; max-width: 100%;
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
    .close-btn:hover { background: rgba(255,255,255,0.06); }
    .body { padding: 16px; flex: 1; }
    .section { margin-bottom: 16px; }
    .label { display: block; font-size: 12px; color: var(--text-secondary, #999); margin-bottom: 4px; }
    .identity { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
    .detail-avatar {
      width: 40px; height: 40px; border-radius: 50%; overflow: hidden;
      display: flex; align-items: center; justify-content: center;
      background: var(--surface, rgba(255,255,255,0.04));
    }
    .detail-avatar.owner-avatar { border: 2px solid var(--accent); }
    .detail-avatar img { width: 100%; height: 100%; object-fit: cover; }
    .avatar-initials { font-size: 12px; color: var(--text); }
    .detail-agent-name { font-size: 14px; font-weight: 500; color: var(--text); }
    .detail-agent-handle { font-size: 12px; color: var(--text-dim, #555); }
    .detail-agent-platform { font-size: 12px; color: var(--text-secondary); }
    .role-pills { display: flex; gap: 4px; flex-wrap: wrap; }
    .role-pill {
      padding: 4px 12px; border-radius: var(--radius-sm, 8px);
      background: var(--surface); border: 1px solid var(--border);
      color: var(--text-secondary); font-size: 12px; cursor: pointer;
    }
    .role-pill.active { background: var(--accent); color: #fff; border-color: var(--accent); }
    .autonomy-bar {
      display: flex; position: relative; background: var(--surface);
      border-radius: var(--radius-sm, 8px); overflow: hidden;
    }
    .autonomy-seg {
      flex: 1; padding: 8px 4px; text-align: center; cursor: pointer;
      font-size: 12px; color: var(--text-secondary); position: relative; z-index: 1;
    }
    .autonomy-seg.active { color: #fff; }
    .autonomy-highlight {
      position: absolute; top: 0; bottom: 0;
      background: var(--accent); border-radius: var(--radius-sm, 8px);
      transition: left 0.25s cubic-bezier(0.4,0,0.2,1), width 0.25s cubic-bezier(0.4,0,0.2,1);
    }
    input, textarea, select {
      width: 100%; box-sizing: border-box;
      background: var(--surface); border: 1px solid var(--border);
      border-radius: var(--radius-sm, 8px); padding: 8px 12px;
      color: var(--text); font-size: 14px; outline: none;
    }
    textarea { resize: vertical; min-height: 80px; }
    input:focus, textarea:focus, select:focus { border-color: var(--accent); }
    select { appearance: auto; }
    .toggle-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
    .toggle-label { font-size: 13px; color: var(--text-secondary); }
    .toggle-switch {
      width: 36px; height: 20px; border-radius: 10px; cursor: pointer;
      background: var(--surface); border: 1px solid var(--border);
      position: relative; transition: background 0.15s ease;
    }
    .toggle-switch.active { background: var(--accent); border-color: var(--accent); }
    .toggle-switch::after {
      content: ''; position: absolute; top: 2px; left: 2px;
      width: 14px; height: 14px; border-radius: 50%; background: #fff;
      transition: transform 0.15s ease;
    }
    .toggle-switch.active::after { transform: translateX(16px); }
    .kpi-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .kpi-item { background: var(--surface); border-radius: var(--radius-sm, 8px); padding: 8px 12px; }
    .kpi-value { display: block; font-size: 16px; font-weight: 600; color: var(--text); }
    .kpi-label { display: block; font-size: 11px; color: var(--text-secondary); }
    .template-btn {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: var(--radius-sm, 8px); padding: 4px 12px;
      color: var(--text-secondary); font-size: 12px; cursor: pointer; margin-top: 4px;
    }
    .template-btn:hover { background: rgba(255,255,255,0.08); }
    .int-chips { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 8px; }
    .int-chip {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 4px 8px; background: var(--surface); border-radius: 4px;
      font-size: 12px; color: var(--text-secondary);
    }
    .int-chip img { width: 16px; height: 16px; }
    .int-chip-remove {
      background: none; border: none; color: var(--text-dim); cursor: pointer; padding: 0;
    }
    .add-int-btn {
      background: var(--surface); border: 1px dashed var(--border);
      border-radius: var(--radius-sm, 8px); padding: 4px 12px;
      color: var(--text-secondary); font-size: 12px; cursor: pointer;
    }
    .add-int-btn:hover { border-color: var(--accent); color: var(--accent); }
  `;

  private fire(name: string, detail?: unknown): void {
    this.dispatchEvent(new CustomEvent(name, { bubbles: true, composed: true, detail }));
  }

  private fireUpdate(patch: Partial<AgentNode>): void {
    this.fire('node-update', { nodeId: this.node?.id, patch });
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
          <span class="title">${isOwner ? t('canvas.ownerSettings') : t('canvas.agentDetails')}</span>
          <button class="close-btn" @click=${() => this.fire('close')}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
        ${node ? this.renderBody(node, isOwner!) : nothing}
      </div>
    `;
  }

  private renderBody(node: AgentNode, isOwner: boolean) {
    const displayName = isOwner ? node.label : (node.meta.firstName || node.label.replace(/^@/, ''));
    const handle = !isOwner && node.label.startsWith('@') ? node.label : '';
    const platformLabel = isOwner ? t('canvas.youOwner') : capitalize(node.platform);

    return html`
      <div class="body">
        ${this.renderIdentity(node, isOwner, displayName, handle, platformLabel)}
        ${!isOwner ? this.renderRolePills(node) : nothing}
        ${!isOwner ? this.renderAutonomy(node) : nothing}
        ${!isOwner ? this.renderDescription(node) : nothing}
        ${this.renderInstructions(node, isOwner)}
        ${isOwner ? this.renderLanguage() : nothing}
        ${!isOwner ? this.renderBehavior(node) : nothing}
        ${!isOwner ? this.renderKpis() : nothing}
        ${!isOwner ? this.renderIntegrations(node) : nothing}
      </div>
    `;
  }

  private renderIdentity(node: AgentNode, isOwner: boolean, displayName: string, handle: string, platformLabel: string) {
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

  private renderRolePills(node: AgentNode) {
    const role = node.role || 'assistant';
    return html`
      <div class="section">
        <span class="label">${t('canvas.role')}</span>
        <div class="role-pills">
          ${ROLES.map((r) => html`
            <button class="role-pill ${role === r ? 'active' : ''}"
              @click=${() => this.fireUpdate({ role: r })}>
              ${capitalize(r)}
            </button>
          `)}
        </div>
      </div>
    `;
  }

  private renderAutonomy(node: AgentNode) {
    const level = typeof node.autonomy === 'number' ? node.autonomy : 1;
    return html`
      <div class="section">
        <span class="label">${t('canvas.autonomy')}</span>
        <div class="autonomy-bar">
          <div class="autonomy-highlight" style="left:${level * 25}%;width:25%"></div>
          ${AUTONOMY_LEVELS.map((a) => html`
            <div class="autonomy-seg ${level === a.level ? 'active' : ''}"
              @click=${() => this.fireUpdate({ autonomy: a.level })}>
              ${a.label}
            </div>
          `)}
        </div>
      </div>
    `;
  }

  private renderDescription(node: AgentNode) {
    return html`
      <div class="section">
        <span class="label">${t('canvas.description')}</span>
        <input type="text" .value=${node.description || ''}
          @input=${(e: InputEvent) => this.fireUpdate({ description: (e.target as HTMLInputElement).value || undefined })}
          placeholder=${t('canvas.descriptionPlaceholder')} />
      </div>
    `;
  }

  private renderInstructions(node: AgentNode, isOwner: boolean) {
    const label = isOwner ? t('canvas.commStyle') : t('canvas.agentPersona');
    const placeholder = isOwner ? t('canvas.commStylePlaceholder') : t('canvas.agentPersonaPlaceholder');
    const template = isOwner ? CEO_TEMPLATE : BOT_TEMPLATE;
    return html`
      <div class="section">
        <span class="label">${label}</span>
        <textarea .value=${node.instructions || ''}
          @input=${(e: InputEvent) => this.fireUpdate({ instructions: (e.target as HTMLTextAreaElement).value })}
          placeholder=${placeholder}></textarea>
        <button class="template-btn" @click=${() => this.fireUpdate({ instructions: template })}>
          ${t('canvas.insertTemplate')}
        </button>
      </div>
    `;
  }

  private renderLanguage() {
    const lang = this.graph?.language || 'auto';
    return html`
      <div class="section">
        <span class="label">${t('canvas.responseLanguage')}</span>
        <select .value=${lang}
          @change=${(e: Event) => this.fire('language-change', { value: (e.target as HTMLSelectElement).value })}>
          ${RESPONSE_LANGUAGES.map((l) => html`
            <option value=${l.value} ?selected=${lang === l.value}>${l.label}</option>
          `)}
        </select>
      </div>
    `;
  }

  private renderBehavior(node: AgentNode) {
    const behavior = node.behavior ?? {};
    return html`
      <div class="section">
        <span class="label">${t('canvas.behavior')}</span>
        ${this.renderToggle(t('canvas.proactive'), behavior.proactive === true, 'proactive')}
        ${this.renderToggle(t('canvas.ownerResponse'), behavior.ownerResponse !== false, 'ownerResponse')}
        ${this.renderToggle(t('canvas.peer'), behavior.peer === true, 'peer')}
      </div>
    `;
  }

  private renderToggle(label: string, active: boolean, key: string) {
    return html`
      <div class="toggle-row">
        <span class="toggle-label">${label}</span>
        <div class="toggle-switch ${active ? 'active' : ''}"
          @click=${() => {
            const behavior = { ...(this.node?.behavior ?? {}) };
            (behavior as Record<string, boolean>)[key] = !active;
            this.fireUpdate({ behavior });
          }}></div>
      </div>
    `;
  }

  private renderKpis() {
    if (!this.kpis) return nothing;
    const k = this.kpis;
    const items = [
      { value: String(k.messagesHandled), label: t('canvas.kpiMessages') },
      { value: String(k.tasksCompleted), label: t('canvas.kpiTasks') },
      { value: k.avgResponseTimeMs > 0 ? (k.avgResponseTimeMs / 1000).toFixed(1) + 's' : '--', label: t('canvas.kpiAvgResponse') },
      { value: k.costUsd > 0 ? '$' + k.costUsd.toFixed(2) : '--', label: t('canvas.kpiCost') },
    ];
    return html`
      <div class="section">
        <span class="label">${t('canvas.kpis')}</span>
        <div class="kpi-grid">
          ${items.map((item) => html`
            <div class="kpi-item">
              <span class="kpi-value">${item.value}</span>
              <span class="kpi-label">${item.label}</span>
            </div>
          `)}
        </div>
      </div>
    `;
  }

  private renderIntegrations(node: AgentNode) {
    const instances = this.graph?.instances ?? [];
    const assigned = node.integrations ?? [];

    return html`
      <div class="section">
        <span class="label">${t('canvas.integrations')}</span>
        <div class="int-chips">
          ${assigned.map((aid) => {
            const inst = instances.find((i) => i.id === aid);
            if (!inst) return nothing;
            const def = this.catalogMap.get(inst.integrationId);
            return html`
              <div class="int-chip">
                ${def?.icon ? html`<img src="/icons/integrations/${def.icon}.svg" alt="" />` : nothing}
                <span>${def?.name ?? inst.label}</span>
                <button class="int-chip-remove" @click=${() => this.handleRemoveIntegration(node.id, inst.id)}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                    <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                  </svg>
                </button>
              </div>
            `;
          })}
        </div>
        <button class="add-int-btn" @click=${() => { this.showIntDropdown = !this.showIntDropdown; }}>
          + ${t('canvas.addIntegration')}
        </button>
        ${this.showIntDropdown ? this.renderIntDropdown(node, instances, assigned) : nothing}
      </div>
    `;
  }

  private renderIntDropdown(node: AgentNode, instances: { id: string; integrationId: string; label: string }[], assigned: string[]) {
    const unassigned = instances.filter((inst) => !assigned.includes(inst.id));
    const filtered = this.intSearchFilter
      ? unassigned.filter((inst) => {
          const label = this.catalogMap.get(inst.integrationId)?.name ?? inst.label;
          return label.toLowerCase().includes(this.intSearchFilter.toLowerCase());
        })
      : unassigned;

    return html`
      <div style="margin-top:4px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-sm,8px);max-height:160px;overflow-y:auto;padding:4px;">
        <input type="text" placeholder="Search..." .value=${this.intSearchFilter}
          @input=${(e: InputEvent) => { this.intSearchFilter = (e.target as HTMLInputElement).value; }}
          style="margin-bottom:4px;" />
        ${filtered.length === 0
          ? html`<div style="padding:8px;font-size:12px;color:var(--text-dim);">No integrations available</div>`
          : filtered.map((inst) => {
              const def = this.catalogMap.get(inst.integrationId);
              return html`
                <div style="padding:4px 8px;cursor:pointer;font-size:12px;color:var(--text-secondary);border-radius:4px;"
                  @click=${() => this.handleAssignIntegration(node.id, inst.id)}>
                  ${def?.name ?? inst.label}
                </div>
              `;
            })}
      </div>
    `;
  }

  private async handleAssignIntegration(nodeId: string, instanceId: string): Promise<void> {
    await assignIntegration(nodeId, instanceId);
    this.showIntDropdown = false;
    this.intSearchFilter = '';
    this.fire('node-update', { nodeId, patch: { integrations: [...(this.node?.integrations ?? []), instanceId] } });
  }

  private async handleRemoveIntegration(nodeId: string, instanceId: string): Promise<void> {
    await unassignIntegration(nodeId, instanceId);
    const updated = (this.node?.integrations ?? []).filter((id) => id !== instanceId);
    this.fire('node-update', { nodeId, patch: { integrations: updated } });
  }
}
