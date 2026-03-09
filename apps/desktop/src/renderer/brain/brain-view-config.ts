import { t } from '../i18n.js';
import { formatTs, escHtml, capitalize, truncate } from './brain-helpers.js';
import {
  brainListEntities,
  brainListRelations,
  brainListEvents,
  brainListObservations,
  brainListConversations,
  brainListFacts,
} from './ipc.js';

type ListResult = { rows: Array<Record<string, unknown>>; total: number };

export interface ViewConfig {
  columns: () => string[];
  filterOptions: () => Array<{ value: string; label: string }>;
  hasSearch: boolean;
  hasFilter: boolean;
  renderRow(r: Record<string, unknown>): string;
  load(opts: Record<string, unknown>): Promise<ListResult>;
  tableName: string;
}

export const VIEW_CONFIG: Record<string, ViewConfig> = {
  entities: {
    columns: () => [
      t('brain.colName'),
      t('brain.colType'),
      t('brain.colImportance'),
      t('brain.colMentions'),
      t('brain.colLastUpdated'),
    ],
    filterOptions: () => [
      { value: '', label: t('brain.typeAll') },
      { value: 'person', label: t('brain.typePerson') },
      { value: 'project', label: t('brain.typeProject') },
      { value: 'company', label: t('brain.typeCompany') },
      { value: 'event', label: t('brain.typeEvent') },
      { value: 'document', label: t('brain.typeDocument') },
      { value: 'goal', label: t('brain.typeGoal') },
      { value: 'place', label: t('brain.typePlace') },
      { value: 'concept', label: t('brain.typeConcept') },
    ],
    hasSearch: true,
    hasFilter: true,
    renderRow(r) {
      const score =
        typeof r.importance_score === 'number' ? Math.round(r.importance_score * 100) : 0;
      return `
        <td>${escHtml(r.name)}</td>
        <td><span class="type-badge type-${escHtml(r.type)}">${escHtml(capitalize(r.type))}</span></td>
        <td><span class="confidence-bar"><span class="confidence-fill" style="width: ${score}%"></span></span> ${score}%</td>
        <td>${(r.mention_count as number) ?? 0}</td>
        <td class="ts">${formatTs(r.last_updated_at as string)}</td>
      `;
    },
    load: (opts) => brainListEntities(opts),
    tableName: 'entities',
  },
  relations: {
    columns: () => [
      t('brain.colFrom'),
      t('brain.colType'),
      t('brain.colTo'),
      t('brain.colStrength'),
      t('brain.colUpdated'),
    ],
    filterOptions: () => [],
    hasSearch: true,
    hasFilter: false,
    renderRow(r) {
      const strength = typeof r.strength === 'number' ? Math.round(r.strength * 100) : 0;
      return `
        <td>${escHtml(r.from_name || r.from_entity_id)}</td>
        <td><span class="type-badge type-pattern">${escHtml(r.type)}</span></td>
        <td>${escHtml(r.to_name || r.to_entity_id)}</td>
        <td><span class="confidence-bar"><span class="confidence-fill" style="width: ${strength}%"></span></span> ${strength}%</td>
        <td class="ts">${formatTs(r.last_updated_at as string)}</td>
      `;
    },
    load: (opts) => brainListRelations(opts),
    tableName: 'relations',
  },
  events: {
    columns: () => [
      t('brain.colSource'),
      t('brain.colType'),
      t('brain.colImportance'),
      t('brain.colTimestamp'),
    ],
    filterOptions: () => [],
    hasSearch: true,
    hasFilter: false,
    renderRow(r) {
      const imp = typeof r.importance === 'number' ? Math.round(r.importance * 100) : 0;
      const evType = (r.event_type as string) || '';
      return `
        <td>${escHtml(capitalize(r.source))}</td>
        <td><span class="type-badge type-${escHtml(evType)}">${escHtml(capitalize(evType))}</span></td>
        <td><span class="confidence-bar"><span class="confidence-fill" style="width: ${imp}%"></span></span> ${imp}%</td>
        <td class="ts">${formatTs(r.timestamp as string)}</td>
      `;
    },
    load: (opts) => brainListEvents(opts),
    tableName: 'events',
  },
  observations: {
    columns: () => [
      t('brain.colContent'),
      t('brain.colType'),
      t('brain.colConfidence'),
      t('brain.colCreated'),
    ],
    filterOptions: () => [
      { value: '', label: t('brain.obsAll') },
      { value: 'pattern', label: t('brain.obsPattern') },
      { value: 'insight', label: t('brain.obsInsight') },
      { value: 'prediction', label: t('brain.obsPrediction') },
      { value: 'preference', label: t('brain.obsPreference') },
      { value: 'fact', label: t('brain.obsFact') },
    ],
    hasSearch: true,
    hasFilter: true,
    renderRow(r) {
      const conf = typeof r.confidence === 'number' ? Math.round(r.confidence * 100) : 0;
      return `
        <td>${escHtml(truncate(r.content, 80))}</td>
        <td><span class="type-badge type-${escHtml(r.type)}">${escHtml(capitalize(r.type))}</span></td>
        <td><span class="confidence-bar"><span class="confidence-fill" style="width: ${conf}%"></span></span> ${conf}%</td>
        <td class="ts">${formatTs(r.created_at as string)}</td>
      `;
    },
    load: (opts) => brainListObservations(opts),
    tableName: 'observations',
  },
  conversations: {
    columns: () => [t('brain.colPlatform'), t('brain.colMessages'), t('brain.colLastMessage')],
    filterOptions: () => [],
    hasSearch: true,
    hasFilter: false,
    renderRow(r) {
      const plat = r.platform
        ? (r.platform as string).charAt(0).toUpperCase() + (r.platform as string).slice(1)
        : '';
      return `
        <td>${escHtml(plat)}</td>
        <td>${(r.message_count as number) ?? 0}</td>
        <td class="ts">${formatTs(r.last_message_at as string)}</td>
      `;
    },
    load: (opts) => brainListConversations(opts),
    tableName: 'agent_conversations',
  },
  facts: {
    columns: () => [
      t('brain.colFact'),
      t('brain.colNode'),
      t('brain.colWorkspace'),
      t('brain.colCreated'),
    ],
    filterOptions: () => [],
    hasSearch: true,
    hasFilter: false,
    renderRow(r) {
      return `
        <td>${escHtml(truncate(r.fact, 80))}</td>
        <td>${escHtml(r.node_id || '-')}</td>
        <td>${escHtml(r.workspace_id || '-')}</td>
        <td class="ts">${formatTs(r.created_at as string)}</td>
      `;
    },
    load: (opts) => brainListFacts(opts),
    tableName: 'agent_memory',
  },
};
