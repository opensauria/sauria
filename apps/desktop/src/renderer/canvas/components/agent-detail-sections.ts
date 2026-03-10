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
    <div class="detail-section">
      <span class="detail-label">${t('canvas.role')}</span>
      <div class="detail-role-pills">
        ${ROLES.map(
          (r) => html`
            <button
              class="detail-role-pill ${role === r ? 'active' : ''}"
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
    <div class="detail-section">
      <span class="detail-label">${t('canvas.autonomy')}</span>
      <div class="detail-autonomy-bar">
        <div
          class="detail-autonomy-highlight"
          style="left:calc(var(--spacing-xs) + ${level} * (100% - 2 * var(--spacing-xs)) / 4);width:calc((100% - 2 * var(--spacing-xs)) / 4)"
        ></div>
        ${AUTONOMY_LEVELS.map(
          (a) => html`
            <div
              class="detail-autonomy-seg ${level === a.level ? 'active' : ''}"
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
    <div class="detail-section">
      <span class="detail-label">${t('canvas.responseLanguage')}</span>
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
    <div class="detail-toggle-row">
      <span class="detail-toggle-label">${label}</span>
      <div
        class="form-toggle ${isActive ? 'active' : ''}"
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
    <div class="detail-section">
      <span class="detail-label">${t('canvas.behavior')}</span>
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

const CODE_PERMISSION_MODES = [
  { value: 'plan', labelKey: 'canvas.permissionPlan' },
  { value: 'acceptEdits', labelKey: 'canvas.permissionAcceptEdits' },
  { value: 'auto', labelKey: 'canvas.permissionAuto' },
  { value: 'default', labelKey: 'canvas.permissionDefault' },
] as const;

export function renderCodeMode(panel: AgentDetailPanel, node: AgentNode) {
  const config = node.codeMode ?? { enabled: false, projectPath: '', permissionMode: 'default' };
  const isEnabled = config.enabled === true;
  const canOpenTerminal = isEnabled && node.status === 'connected' && config.projectPath;

  return html`
    <div class="detail-section">
      <span class="detail-label">${t('canvas.codeMode')}</span>
      <div class="detail-toggle-row">
        <span class="detail-toggle-label">${t('canvas.codeModeEnabled')}</span>
        <div
          class="form-toggle ${isEnabled ? 'active' : ''}"
          @click=${() => {
            const codeMode = { ...config, enabled: !isEnabled };
            panel.fireUpdate({ codeMode });
          }}
        ></div>
      </div>
      ${isEnabled ? renderCodeModeOptions(panel, config) : nothing}
      ${canOpenTerminal
        ? html`
            <button
              class="detail-terminal-btn"
              @click=${() => fire(panel, 'open-terminal', { nodeId: node.id })}
            >
              <img class="icon-mono" src="/icons/terminal.svg" alt="" />
              ${t('canvas.openTerminal')}
            </button>
          `
        : nothing}
    </div>
  `;
}

function renderCodeModeOptions(
  panel: AgentDetailPanel,
  config: { enabled?: boolean; projectPath?: string; permissionMode?: string; sessionId?: string },
) {
  const activeMode = config.permissionMode ?? 'default';
  const modeCount = CODE_PERMISSION_MODES.length;

  const activeIndex = CODE_PERMISSION_MODES.findIndex((m) => m.value === activeMode);
  const idx = activeIndex >= 0 ? activeIndex : modeCount - 1;

  return html`
    <div class="detail-section" style="gap: var(--spacing-smd)">
      <span class="detail-label">${t('canvas.projectPath')}</span>
      <input
        type="text"
        .value=${config.projectPath ?? ''}
        @change=${(e: Event) =>
          panel.fireUpdate({
            codeMode: { ...config, projectPath: (e.target as HTMLInputElement).value },
          })}
        placeholder="/path/to/project"
      />
    </div>

    <div class="detail-section" style="gap: var(--spacing-smd)">
      <span class="detail-label">${t('canvas.permissionMode')}</span>
      <div class="detail-autonomy-bar">
        <div
          class="detail-autonomy-highlight"
          style="left:calc(var(--spacing-xs) + ${idx} * (100% - 2 * var(--spacing-xs)) / ${modeCount});width:calc((100% - 2 * var(--spacing-xs)) / ${modeCount})"
        ></div>
        ${CODE_PERMISSION_MODES.map(
          (m) => html`
            <div
              class="detail-autonomy-seg ${activeMode === m.value ? 'active' : ''}"
              @click=${() =>
                panel.fireUpdate({
                  codeMode: { ...config, permissionMode: m.value },
                })}
            >
              ${t(m.labelKey)}
            </div>
          `,
        )}
      </div>
    </div>

    ${config.sessionId
      ? html`
          <button
            class="detail-template-btn"
            @click=${() =>
              panel.fireUpdate({
                codeMode: { ...config, sessionId: undefined },
              })}
          >
            ${t('canvas.resetSession')}
          </button>
        `
      : nothing}
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
    <div class="detail-section">
      <span class="detail-label">${t('canvas.kpis')}</span>
      <div class="detail-kpi-grid">
        ${items.map(
          (item) => html`
            <div class="detail-kpi-item">
              <span class="detail-kpi-value">${item.value}</span>
              <span class="detail-kpi-label">${item.label}</span>
            </div>
          `,
        )}
      </div>
    </div>
  `;
}
