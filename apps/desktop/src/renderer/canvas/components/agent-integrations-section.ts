import { LitElement, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { t } from '../../i18n.js';
import type { AgentNode, CanvasGraph, IntegrationDef } from '../types.js';
import { fire } from '../fire.js';
import { assignIntegration, unassignIntegration } from '../ipc.js';
import { agentIntegrationsStyles } from './agent-integrations-styles.js';

@customElement('agent-integrations-section')
export class AgentIntegrationsSection extends LitElement {
  @property({ attribute: false }) node: AgentNode | null = null;
  @property({ attribute: false }) graph: CanvasGraph | null = null;
  @property({ attribute: false }) catalogMap = new Map<string, IntegrationDef>();

  @state() private showIntDropdown = false;
  @state() private intSearchFilter = '';

  static styles = agentIntegrationsStyles;

  render() {
    if (!this.node) return nothing;
    return this.renderIntegrations(this.node);
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
                ${def?.icon
                  ? html`<img src="/icons/integrations/${def.icon}.svg" alt="" />`
                  : nothing}
                <span>${def?.name ?? inst.label}</span>
                <button
                  class="int-chip-remove"
                  @click=${() => this.handleRemoveIntegration(node.id, inst.id)}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M18 6L6 18M6 6l12 12"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                    />
                  </svg>
                </button>
              </div>
            `;
          })}
        </div>
        <button
          class="add-int-btn"
          @click=${() => {
            this.showIntDropdown = !this.showIntDropdown;
          }}
        >
          + ${t('canvas.addIntegration')}
        </button>
        ${this.showIntDropdown ? this.renderIntDropdown(node, instances, assigned) : nothing}
      </div>
    `;
  }

  private renderIntDropdown(
    node: AgentNode,
    instances: { id: string; integrationId: string; label: string }[],
    assigned: string[],
  ) {
    const unassigned = instances.filter((inst) => !assigned.includes(inst.id));
    const filtered = this.intSearchFilter
      ? unassigned.filter((inst) => {
          const label = this.catalogMap.get(inst.integrationId)?.name ?? inst.label;
          return label.toLowerCase().includes(this.intSearchFilter.toLowerCase());
        })
      : unassigned;

    return html`
      <div class="int-dropdown">
        <input
          class="int-dropdown-search"
          type="text"
          placeholder="Search..."
          .value=${this.intSearchFilter}
          @input=${(e: InputEvent) => {
            this.intSearchFilter = (e.target as HTMLInputElement).value;
          }}
        />
        ${filtered.length === 0
          ? html`<div class="int-dropdown-empty">No integrations available</div>`
          : filtered.map((inst) => {
              const def = this.catalogMap.get(inst.integrationId);
              return html`
                <div
                  class="int-dropdown-item"
                  @click=${() => this.handleAssignIntegration(node.id, inst.id)}
                >
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
    fire(this, 'node-update', {
      nodeId,
      patch: { integrations: [...(this.node?.integrations ?? []), instanceId] },
    });
  }

  private async handleRemoveIntegration(nodeId: string, instanceId: string): Promise<void> {
    await unassignIntegration(nodeId, instanceId);
    const updated = (this.node?.integrations ?? []).filter((id) => id !== instanceId);
    fire(this, 'node-update', { nodeId, patch: { integrations: updated } });
  }
}
