import { html, nothing, type TemplateResult } from 'lit';
import { t } from '../../i18n.js';
import type { AgentNode } from '../types.js';
import {
  ROLES,
  AUTONOMY_LEVELS,
  CEO_TEMPLATE,
  BOT_TEMPLATE,
  RESPONSE_LANGUAGES,
} from '../constants.js';
import { capitalize } from '../helpers.js';

type FireUpdate = (patch: Partial<AgentNode>) => void;
type FireFn = (name: string, detail?: unknown) => void;

export function renderRolePills(node: AgentNode, fireUpdate: FireUpdate): TemplateResult {
  const role = node.role || 'assistant';
  return html`
    <div class="section">
      <span class="label">${t('canvas.role')}</span>
      <div class="role-pills">
        ${ROLES.map(
          (r) => html`
            <button
              class="role-pill ${role === r ? 'active' : ''}"
              @click=${() => fireUpdate({ role: r })}
            >
              ${capitalize(r)}
            </button>
          `,
        )}
      </div>
    </div>
  `;
}

export function renderAutonomy(node: AgentNode, fireUpdate: FireUpdate): TemplateResult {
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
              @click=${() => fireUpdate({ autonomy: a.level })}
            >
              ${a.label}
            </div>
          `,
        )}
      </div>
    </div>
  `;
}

export function renderDescription(node: AgentNode, fireUpdate: FireUpdate): TemplateResult {
  return html`
    <div class="section">
      <span class="label">${t('canvas.description')}</span>
      <input
        type="text"
        .value=${node.description || ''}
        @input=${(e: InputEvent) =>
          fireUpdate({ description: (e.target as HTMLInputElement).value || undefined })}
        placeholder=${t('canvas.descriptionPlaceholder')}
      />
    </div>
  `;
}

export function renderInstructions(
  node: AgentNode,
  isOwner: boolean,
  fireUpdate: FireUpdate,
): TemplateResult {
  const label = isOwner ? t('canvas.commStyle') : t('canvas.agentPersona');
  const placeholder = isOwner
    ? t('canvas.commStylePlaceholder')
    : t('canvas.agentPersonaPlaceholder');
  const template = isOwner ? CEO_TEMPLATE : BOT_TEMPLATE;
  return html`
    <div class="section">
      <span class="label">${label}</span>
      <textarea
        .value=${node.instructions || ''}
        @input=${(e: InputEvent) =>
          fireUpdate({ instructions: (e.target as HTMLTextAreaElement).value })}
        placeholder=${placeholder}
      ></textarea>
      <button class="template-btn" @click=${() => fireUpdate({ instructions: template })}>
        ${t('canvas.insertTemplate')}
      </button>
    </div>
  `;
}

export function renderLanguage(lang: string, fireFn: FireFn): TemplateResult {
  return html`
    <div class="section">
      <span class="label">${t('canvas.responseLanguage')}</span>
      <select
        .value=${lang}
        @change=${(e: Event) =>
          fireFn('language-change', { value: (e.target as HTMLSelectElement).value })}
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
  fireUpdate: FireUpdate,
): TemplateResult {
  return html`
    <div class="toggle-row">
      <span class="toggle-label">${label}</span>
      <div
        class="toggle-switch ${isActive ? 'active' : ''}"
        @click=${() => {
          const behavior = { ...(node.behavior ?? {}) };
          (behavior as Record<string, boolean>)[key] = !isActive;
          fireUpdate({ behavior });
        }}
      ></div>
    </div>
  `;
}

export function renderBehavior(node: AgentNode, fireUpdate: FireUpdate): TemplateResult {
  const behavior = node.behavior ?? {};
  return html`
    <div class="section">
      <span class="label">${t('canvas.behavior')}</span>
      ${renderToggle(
        t('canvas.proactive'),
        behavior.proactive === true,
        'proactive',
        node,
        fireUpdate,
      )}
      ${renderToggle(
        t('canvas.ownerResponse'),
        behavior.ownerResponse !== false,
        'ownerResponse',
        node,
        fireUpdate,
      )}
      ${renderToggle(t('canvas.peer'), behavior.peer === true, 'peer', node, fireUpdate)}
    </div>
  `;
}

interface KpiData {
  readonly messagesHandled: number;
  readonly tasksCompleted: number;
  readonly avgResponseTimeMs: number;
  readonly costUsd: number;
}

export function renderKpis(kpis: KpiData | null): TemplateResult | typeof nothing {
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
