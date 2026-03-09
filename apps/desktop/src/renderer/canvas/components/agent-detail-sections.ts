import { html, nothing } from 'lit';
import { t } from '../../i18n.js';
import type { AgentNode } from '../types.js';
import { ROLES, AUTONOMY_LEVELS, RESPONSE_LANGUAGES } from '../constants.js';
import { capitalize } from '../helpers.js';
import { fire } from '../fire.js';
import type { AgentDetailPanel } from './agent-detail-panel.js';

export interface KpiData {
  readonly messagesHandled: number;
  readonly tasksCompleted: number;
  readonly avgResponseTimeMs: number;
  readonly costUsd: number;
}

export function renderRolePills(panel: AgentDetailPanel, node: AgentNode) {
  const role = node.role || 'assistant';
  return html`
    <div class="section">
      <span class="label">${t('canvas.role')}</span>
      <div class="role-pills">
        ${ROLES.map(
          (r) => html`
            <button
              class="role-pill ${role === r ? 'active' : ''}"
              @click=${() => panel.fireUpdate({ role: r })}
            >
              ${capitalize(r)}
            </button>
          `,
        )}
      </div>
    </div>
  `;
}

export function renderAutonomy(panel: AgentDetailPanel, node: AgentNode) {
  const level = typeof node.autonomy === 'number' ? node.autonomy : 1;
  return html`
    <div class="section">
      <span class="label">${t('canvas.autonomy')}</span>
      <div class="autonomy-bar">
        <div class="autonomy-highlight" style="left:${level * 25}%;width:25%"></div>
        ${AUTONOMY_LEVELS.map(
          (a) => html`
            <div
              class="autonomy-seg ${level === a.level ? 'active' : ''}"
              @click=${() => panel.fireUpdate({ autonomy: a.level })}
            >
              ${a.label}
            </div>
          `,
        )}
      </div>
    </div>
  `;
}

export function renderLanguage(panel: AgentDetailPanel, lang: string) {
  return html`
    <div class="section">
      <span class="label">${t('canvas.responseLanguage')}</span>
      <select
        .value=${lang}
        @change=${(e: Event) =>
          fire(panel, 'language-change', { value: (e.target as HTMLSelectElement).value })}
      >
        ${RESPONSE_LANGUAGES.map(
          (l) => html` <option value=${l.code} ?selected=${lang === l.code}>${l.label}</option> `,
        )}
      </select>
    </div>
  `;
}

function renderToggle(
  label: string,
  isActive: boolean,
  key: string,
  node: AgentNode,
  panel: AgentDetailPanel,
) {
  return html`
    <div class="toggle-row">
      <span class="toggle-label">${label}</span>
      <div
        class="toggle-switch ${isActive ? 'active' : ''}"
        @click=${() => {
          const behavior = { ...(node.behavior ?? {}) };
          (behavior as Record<string, boolean>)[key] = !isActive;
          panel.fireUpdate({ behavior });
        }}
      ></div>
    </div>
  `;
}

export function renderBehavior(panel: AgentDetailPanel, node: AgentNode) {
  const behavior = node.behavior ?? {};
  return html`
    <div class="section">
      <span class="label">${t('canvas.behavior')}</span>
      ${renderToggle(t('canvas.proactive'), behavior.proactive === true, 'proactive', node, panel)}
      ${renderToggle(
        t('canvas.ownerResponse'),
        behavior.ownerResponse !== false,
        'ownerResponse',
        node,
        panel,
      )}
      ${renderToggle(t('canvas.peer'), behavior.peer === true, 'peer', node, panel)}
    </div>
  `;
}

export function renderKpis(kpis: KpiData | null) {
  if (!kpis) return nothing;
  const items = [
    { value: String(kpis.messagesHandled), label: t('canvas.kpiMessages') },
    { value: String(kpis.tasksCompleted), label: t('canvas.kpiTasks') },
    {
      value: kpis.avgResponseTimeMs > 0 ? (kpis.avgResponseTimeMs / 1000).toFixed(1) + 's' : '--',
      label: t('canvas.kpiAvgResponse'),
    },
    {
      value: kpis.costUsd > 0 ? '$' + kpis.costUsd.toFixed(2) : '--',
      label: t('canvas.kpiCost'),
    },
  ];
  return html`
    <div class="section">
      <span class="label">${t('canvas.kpis')}</span>
      <div class="kpi-grid">
        ${items.map(
          (item) => html`
            <div class="kpi-item">
              <span class="kpi-value">${item.value}</span>
              <span class="kpi-label">${item.label}</span>
            </div>
          `,
        )}
      </div>
    </div>
  `;
}
