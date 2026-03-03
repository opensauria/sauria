import { invoke } from '@tauri-apps/api/core';
import { initScene, disposeScene } from './scene-manager.js';
import type { BrainNode, BrainEdge } from './scene-types.js';

/* ── State ───────────────────────────────────────────────────────── */
let currentView = 'entities';
let currentRows: Array<Record<string, unknown>> = [];
let currentTotal = 0;
let currentOffset = 0;
const PAGE_SIZE = 50;
let selectedId: string | null = null;
let searchTimeout: ReturnType<typeof setTimeout> | null = null;
let stats: Record<string, number> | null = null;

/* ── Library State ─────────────────────────────────────────────── */
let graphMode = 'brain';
let libraryEntities: Array<Record<string, unknown>> = [];
let libraryFiltered: Array<Record<string, unknown>> = [];
let libActiveIndex = 0;
let libCurrentIndex = 0;
let libVelocity = 0;
let libAnimating = false;
let libSearchTimeout: ReturnType<typeof setTimeout> | null = null;
let libraryDirty = true;
let libScrollAccum = 0;
const LIB_SCROLL_THRESHOLD = 50;
let libScrollTimer: ReturnType<typeof setTimeout> | null = null;

/* ── DOM refs ────────────────────────────────────────────────────── */
const navItems = document.querySelectorAll('.brain-nav-item');
const searchInput = document.getElementById('search-input') as HTMLInputElement;
const filterSelect = document.getElementById('filter-select') as HTMLSelectElement;
const statsBar = document.getElementById('stats-bar') as HTMLDivElement;
const tableHead = document.getElementById('table-head') as HTMLTableSectionElement;
const tableBody = document.getElementById('table-body') as HTMLTableSectionElement;
const emptyState = document.getElementById('empty-state') as HTMLDivElement;
const loadMore = document.getElementById('load-more') as HTMLDivElement;
const loadMoreBtn = document.getElementById('load-more-btn') as HTMLButtonElement;
const detailPanel = document.getElementById('detail-panel') as HTMLElement;
const detailTitle = document.getElementById('detail-title') as HTMLSpanElement;
const detailBody = document.getElementById('detail-body') as HTMLDivElement;
const detailDelete = document.getElementById('detail-delete') as HTMLButtonElement;
const detailClose = document.getElementById('detail-close') as HTMLDivElement;
const graphWrap = document.getElementById('graph-wrap') as HTMLDivElement;
const graphStats = document.getElementById('graph-stats') as HTMLDivElement;
const deleteDialog = document.getElementById('delete-dialog') as HTMLDivElement;
const deleteDialogText = document.getElementById('delete-dialog-text') as HTMLDivElement;
const deleteDialogWarning = document.getElementById('delete-dialog-warning') as HTMLDivElement;
const deleteCancel = document.getElementById('delete-cancel') as HTMLButtonElement;
const deleteConfirm = document.getElementById('delete-confirm') as HTMLButtonElement;
const viewToggle = document.getElementById('view-toggle') as HTMLDivElement;
const libraryView = document.getElementById('library-view') as HTMLDivElement;
const libraryTrack = document.getElementById('library-track') as HTMLDivElement;
const libraryEmpty = document.getElementById('library-empty') as HTMLDivElement;
const librarySearchInput = document.getElementById('library-search-input') as HTMLInputElement;
const brain3dContainer = document.getElementById('brain-3d-container') as HTMLDivElement;
const brain3dTooltip = document.getElementById('brain-3d-tooltip') as HTMLDivElement;

/* ── Helpers ─────────────────────────────────────────────────────── */
function formatTs(ts: string | null | undefined): string {
  if (!ts) return '-';
  const d = new Date(ts.includes('T') ? ts : ts + 'Z');
  if (isNaN(d.getTime())) return ts;
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
  if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
  if (diff < 604800000) return Math.floor(diff / 86400000) + 'd ago';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function escHtml(str: unknown): string {
  if (!str) return '';
  const d = document.createElement('div');
  d.textContent = String(str);
  return d.innerHTML;
}

function truncate(str: unknown, len: number): string {
  if (!str) return '';
  const s = String(str);
  return s.length > len ? s.slice(0, len) + '...' : s;
}

function capitalize(str: unknown): string {
  if (!str) return '';
  const s = String(str);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const UPPER_WORDS = new Set(['id', 'url', 'api', 'uuid', 'ip', 'fts', 'ceo']);
function toTitleCase(str: string): string {
  return str.replace(/_/g, ' ').replace(/\b\w+/g, (w) => {
    const lower = w.toLowerCase();
    if (UPPER_WORDS.has(lower)) return lower.toUpperCase();
    return w.charAt(0).toUpperCase() + w.slice(1);
  });
}

function parseJson(raw: unknown): Record<string, unknown> | null {
  if (!raw) return null;
  if (typeof raw === 'object') return raw as Record<string, unknown>;
  try {
    return JSON.parse(raw as string);
  } catch {
    return null;
  }
}

/* ── Stats ───────────────────────────────────────────────────────── */
async function loadStats() {
  try {
    stats = await invoke('brain_get_stats');
    renderStats();
    updateNavCounts();
  } catch (err) {
    console.error('[brain] loadStats failed:', err);
    statsBar.innerHTML =
      '<div class="brain-stat"><span style="color: var(--error)">Could not connect to OpenSauria</span></div>';
  }
}

function renderStats() {
  if (!stats) return;
  statsBar.innerHTML = `
    <div class="brain-stat"><span class="brain-stat-value">${stats.entities}</span> entities</div>
    <div class="brain-stat"><span class="brain-stat-value">${stats.relations}</span> relations</div>
    <div class="brain-stat"><span class="brain-stat-value">${stats.events}</span> events</div>
    <div class="brain-stat"><span class="brain-stat-value">${stats.observations}</span> observations</div>
    <div class="brain-stat"><span class="brain-stat-value">${stats.conversations}</span> conversations</div>
    <div class="brain-stat"><span class="brain-stat-value">${stats.facts}</span> facts</div>
  `;
}

function updateNavCounts() {
  if (!stats) return;
  (document.getElementById('nav-count-entities') as HTMLSpanElement).textContent = String(
    stats.entities,
  );
  (document.getElementById('nav-count-relations') as HTMLSpanElement).textContent = String(
    stats.relations,
  );
  (document.getElementById('nav-count-events') as HTMLSpanElement).textContent = String(
    stats.events,
  );
  (document.getElementById('nav-count-observations') as HTMLSpanElement).textContent = String(
    stats.observations,
  );
  (document.getElementById('nav-count-conversations') as HTMLSpanElement).textContent = String(
    stats.conversations,
  );
  (document.getElementById('nav-count-facts') as HTMLSpanElement).textContent = String(stats.facts);
}

/* ── View Configuration ──────────────────────────────────────────── */
interface ViewConfig {
  columns: string[];
  filterOptions: Array<{ value: string; label: string }>;
  hasSearch: boolean;
  hasFilter: boolean;
  renderRow(r: Record<string, unknown>): string;
  load(
    opts: Record<string, unknown>,
  ): Promise<{ rows: Array<Record<string, unknown>>; total: number }>;
  tableName: string;
}

const viewConfig: Record<string, ViewConfig> = {
  entities: {
    columns: ['Name', 'Type', 'Importance', 'Mentions', 'Last Updated'],
    filterOptions: [
      { value: '', label: 'All types' },
      { value: 'person', label: 'Person' },
      { value: 'project', label: 'Project' },
      { value: 'company', label: 'Company' },
      { value: 'event', label: 'Event' },
      { value: 'document', label: 'Document' },
      { value: 'goal', label: 'Goal' },
      { value: 'place', label: 'Place' },
      { value: 'concept', label: 'Concept' },
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
    async load(opts) {
      return invoke('brain_list_entities', { opts });
    },
    tableName: 'entities',
  },
  relations: {
    columns: ['From', 'Type', 'To', 'Strength', 'Updated'],
    filterOptions: [],
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
    async load(opts) {
      return invoke('brain_list_relations', { opts });
    },
    tableName: 'relations',
  },
  events: {
    columns: ['Source', 'Type', 'Importance', 'Timestamp'],
    filterOptions: [],
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
    async load(opts) {
      return invoke('brain_list_events', { opts });
    },
    tableName: 'events',
  },
  observations: {
    columns: ['Content', 'Type', 'Confidence', 'Created'],
    filterOptions: [
      { value: '', label: 'All types' },
      { value: 'pattern', label: 'Pattern' },
      { value: 'insight', label: 'Insight' },
      { value: 'prediction', label: 'Prediction' },
      { value: 'preference', label: 'Preference' },
      { value: 'fact', label: 'Fact' },
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
    async load(opts) {
      return invoke('brain_list_observations', { opts });
    },
    tableName: 'observations',
  },
  conversations: {
    columns: ['Platform', 'Messages', 'Last Message'],
    filterOptions: [],
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
    async load(opts) {
      return invoke('brain_list_conversations', { opts });
    },
    tableName: 'agent_conversations',
  },
  facts: {
    columns: ['Fact', 'Node', 'Workspace', 'Created'],
    filterOptions: [],
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
    async load(opts) {
      return invoke('brain_list_facts', { opts });
    },
    tableName: 'agent_memory',
  },
};

/* ── Navigation ──────────────────────────────────────────────────── */
navItems.forEach((item) => {
  item.addEventListener('click', () => {
    const view = (item as HTMLElement).dataset.view;
    if (view === currentView) return;
    if (view) switchView(view);
  });
});

function switchView(view: string) {
  currentView = view;
  currentOffset = 0;
  currentRows = [];
  selectedId = null;
  closeDetail();

  navItems.forEach((n) => n.classList.toggle('active', (n as HTMLElement).dataset.view === view));

  const isGraph = view === 'graph';
  graphWrap.style.display = isGraph ? '' : 'none';
  (document.getElementById('table-wrap') as HTMLDivElement).style.display = isGraph ? 'none' : '';
  (document.querySelector('.brain-toolbar') as HTMLDivElement).style.display = isGraph
    ? 'none'
    : '';
  (document.getElementById('stats-bar') as HTMLDivElement).style.display = isGraph ? 'none' : '';

  if (!isGraph) {
    disposeScene();
  }

  if (isGraph) {
    setGraphMode(graphMode);
    return;
  }

  const cfg = viewConfig[view];
  searchInput.value = '';
  searchInput.placeholder = `Search ${view}...`;
  searchInput.disabled = false;

  if (cfg.hasFilter && cfg.filterOptions.length > 0) {
    filterSelect.style.display = '';
    filterSelect.innerHTML = cfg.filterOptions
      .map((o) => `<option value="${escHtml(o.value)}">${escHtml(o.label)}</option>`)
      .join('');
  } else {
    filterSelect.style.display = 'none';
  }

  renderTableHead(cfg.columns);
  loadData();
}

/* ── Table Rendering ─────────────────────────────────────────────── */
function renderTableHead(columns: string[]) {
  tableHead.innerHTML = '<tr>' + columns.map((c) => `<th>${escHtml(c)}</th>`).join('') + '</tr>';
}

function renderTableRows(rows: Array<Record<string, unknown>>, append?: boolean) {
  const cfg = viewConfig[currentView];
  if (!append) tableBody.innerHTML = '';

  for (const r of rows) {
    const tr = document.createElement('tr');
    tr.dataset.id = r.id as string;
    tr.innerHTML = cfg.renderRow(r);
    if (r.id === selectedId) tr.classList.add('selected');
    tr.addEventListener('click', () => handleRowClick(r));
    tableBody.appendChild(tr);
  }

  emptyState.style.display = currentRows.length === 0 ? 'flex' : 'none';
  loadMore.style.display = currentRows.length < currentTotal ? '' : 'none';
}

/* ── Data Loading ────────────────────────────────────────────────── */
async function loadData(append?: boolean) {
  const cfg = viewConfig[currentView];
  const opts: Record<string, unknown> = { offset: currentOffset, limit: PAGE_SIZE };

  if (cfg.hasSearch && searchInput.value.trim()) {
    opts.search = searchInput.value.trim();
  }
  if (cfg.hasFilter && filterSelect.value) {
    if (currentView === 'entities') opts.type = filterSelect.value;
    else if (currentView === 'observations') opts.type = filterSelect.value;
    else if (currentView === 'events') opts.source = filterSelect.value;
    else if (currentView === 'conversations') opts.platform = filterSelect.value;
  }

  try {
    const result = await cfg.load(opts);
    if (append) {
      currentRows = currentRows.concat(result.rows);
    } else {
      currentRows = result.rows;
    }
    currentTotal = result.total;
    renderTableRows(append ? result.rows : currentRows, append);
  } catch (err) {
    console.error('[brain] loadData failed:', currentView, err);
    if (!append) {
      tableBody.innerHTML = '';
      emptyState.style.display = 'flex';
      (emptyState.querySelector('div') as HTMLDivElement).textContent = 'Something went wrong';
    }
  }
}

/* ── Search ──────────────────────────────────────────────────────── */
searchInput.addEventListener('input', () => {
  if (searchTimeout) clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    currentOffset = 0;
    loadData();
  }, 300);
});

filterSelect.addEventListener('change', () => {
  currentOffset = 0;
  loadData();
});

loadMoreBtn.addEventListener('click', () => {
  currentOffset += PAGE_SIZE;
  loadData(true);
});

/* ── Row Click → Detail ──────────────────────────────────────────── */
function handleRowClick(row: Record<string, unknown>) {
  selectedId = row.id as string;
  tableBody
    .querySelectorAll('tr')
    .forEach((tr) => tr.classList.toggle('selected', tr.dataset.id === (row.id as string)));

  if (currentView === 'entities') showEntityDetail(row.id as string);
  else if (currentView === 'conversations') showConversationDetail(row);
  else showGenericDetail(row);
}

/* ── Entity Detail ───────────────────────────────────────────────── */
async function showEntityDetail(id: string) {
  const data: {
    entity: Record<string, unknown>;
    relations: Array<Record<string, unknown>>;
    events: Array<Record<string, unknown>>;
  } | null = await invoke('brain_get_entity', { id });
  if (!data) return;
  const { entity: e, relations, events } = data;

  detailTitle.textContent = e.name as string;
  detailDelete.dataset.table = 'entities';
  detailDelete.dataset.id = e.id as string;
  detailDelete.dataset.name = e.name as string;

  let html = `
    <div class="brain-detail-section">
      <div class="brain-detail-field">
        <div class="brain-detail-label">Name</div>
        <input class="brain-detail-value editable" id="edit-name" value="${escHtml(e.name)}" />
      </div>
      <div class="brain-detail-field">
        <div class="brain-detail-label">Type</div>
        <span class="type-badge type-${escHtml(e.type)}">${escHtml(e.type)}</span>
      </div>
      <div class="brain-detail-field">
        <div class="brain-detail-label">Summary</div>
        <textarea class="brain-detail-value editable" id="edit-summary" rows="3">${escHtml(e.summary || '')}</textarea>
      </div>
  `;

  const props = parseJson(e.properties);
  if (props && Object.keys(props).length > 0) {
    html += '<div class="brain-detail-field"><div class="brain-detail-label">Properties</div>';
    for (const [k, v] of Object.entries(props)) {
      html += `<div class="brain-detail-value" style="font-size: 12px; margin-bottom: 4px"><strong>${escHtml(k)}:</strong> ${escHtml(String(v))}</div>`;
    }
    html += '</div>';
  }

  html += `
      <div class="brain-detail-field">
        <div class="brain-detail-label">Importance</div>
        <div class="brain-detail-value">${Math.round(((e.importance_score as number) ?? 0) * 100)}%</div>
      </div>
      <div class="brain-detail-field">
        <div class="brain-detail-label">Mentions</div>
        <div class="brain-detail-value">${(e.mention_count as number) ?? 0}</div>
      </div>
      <div class="brain-detail-field">
        <div class="brain-detail-label">First Seen</div>
        <div class="brain-detail-value ts">${formatTs(e.first_seen_at as string)}</div>
      </div>
    </div>
  `;

  if (relations.length > 0) {
    html +=
      '<div class="brain-detail-section"><div class="brain-detail-section-title">Relations</div>';
    for (const r of relations) {
      const isFrom = r.from_entity_id === e.id;
      const otherName = isFrom ? r.to_name || r.to_entity_id : r.from_name || r.from_entity_id;
      const otherId = isFrom ? r.to_entity_id : r.from_entity_id;
      const arrow = isFrom ? '\u2192' : '\u2190';
      html += `<div class="brain-relation-item" data-entity-id="${escHtml(otherId)}">
        ${arrow} <span class="brain-relation-type">${escHtml(r.type)}</span>
        <span class="brain-relation-name">${escHtml(otherName)}</span>
      </div>`;
    }
    html += '</div>';
  }

  if (events.length > 0) {
    html +=
      '<div class="brain-detail-section"><div class="brain-detail-section-title">Recent Events</div>';
    for (const ev of events) {
      const parsed = parseJson(ev.parsed_data);
      const text = parsed?.summary || parsed?.title || ev.event_type;
      html += `<div class="brain-event-item">
        <span class="brain-event-time">${formatTs(ev.timestamp as string)}</span>
        <span class="brain-event-text">${escHtml(truncate(String(text), 60))}</span>
      </div>`;
    }
    html += '</div>';
  }

  detailBody.innerHTML = html;
  openDetail();

  const editName = document.getElementById('edit-name') as HTMLInputElement;
  const editSummary = document.getElementById('edit-summary') as HTMLTextAreaElement;
  let saveTimeout: ReturnType<typeof setTimeout> | null = null;

  function saveEntity() {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
      await invoke('brain_update_entity', {
        id: e.id,
        fields: {
          name: editName.value.trim() || e.name,
          summary: editSummary.value.trim() || null,
        },
      });
      detailTitle.textContent = editName.value.trim() || (e.name as string);
      libraryDirty = true;
      currentOffset = 0;
      loadData();
      loadStats();
    }, 500);
  }

  editName.addEventListener('input', saveEntity);
  editSummary.addEventListener('input', saveEntity);

  detailBody.querySelectorAll('.brain-relation-item').forEach((item) => {
    item.addEventListener('click', () => {
      const eid = (item as HTMLElement).dataset.entityId;
      if (eid) showEntityDetail(eid);
    });
  });
}

/* ── Conversation Detail ─────────────────────────────────────────── */
async function showConversationDetail(conv: Record<string, unknown>) {
  const platName = conv.platform
    ? (conv.platform as string).charAt(0).toUpperCase() + (conv.platform as string).slice(1)
    : '';
  detailTitle.textContent = `${platName} conversation`;
  detailDelete.dataset.table = 'agent_conversations';
  detailDelete.dataset.id = conv.id as string;
  detailDelete.dataset.name = `${platName} conversation`;

  const result: { rows: Array<Record<string, unknown>> } = await invoke('brain_get_conversation', {
    id: conv.id,
    opts: { offset: 0, limit: 100 },
  });
  let html = `
    <div class="brain-detail-section">
      <div class="brain-detail-field">
        <div class="brain-detail-label">Platform</div>
        <div class="brain-detail-value">${escHtml(platName)}</div>
      </div>
      <div class="brain-detail-field">
        <div class="brain-detail-label">Messages</div>
        <div class="brain-detail-value">${(conv.message_count as number) ?? 0}</div>
      </div>
      <div class="brain-detail-field">
        <div class="brain-detail-label">Last Message</div>
        <div class="brain-detail-value ts">${formatTs(conv.last_message_at as string)}</div>
      </div>
    </div>
  `;

  if (result.rows.length > 0) {
    html +=
      '<div class="brain-detail-section"><div class="brain-detail-section-title">Messages</div>';
    for (const m of result.rows) {
      const isCeo = m.sender_is_ceo === 1;
      html += `<div class="brain-message">
        <div class="brain-message-header">
          <span class="brain-message-sender ${isCeo ? 'is-ceo' : ''}">${escHtml(m.sender_id)}</span>
          <span class="brain-message-time">${formatTs(m.created_at as string)}</span>
        </div>
        <div class="brain-message-content">${escHtml(m.content)}</div>
      </div>`;
    }
    html += '</div>';
  }

  detailBody.innerHTML = html;
  openDetail();
}

/* ── Generic Detail (events, observations, relations, facts) ─── */
function showGenericDetail(row: Record<string, unknown>) {
  const cfg = viewConfig[currentView];
  detailDelete.dataset.table = cfg.tableName;
  detailDelete.dataset.id = row.id as string;

  let title = '';
  let html = '<div class="brain-detail-section">';

  for (const [key, val] of Object.entries(row)) {
    if (key === 'id') continue;
    const displayKey = toTitleCase(key);
    let displayVal: unknown = val;

    if (typeof val === 'string' && val.length > 200) {
      displayVal = val;
      title = title || truncate(val, 40);
    } else if (typeof val === 'object' && val !== null) {
      displayVal = JSON.stringify(val, null, 2);
    }

    if (!title && (key === 'name' || key === 'content' || key === 'fact' || key === 'type')) {
      title = truncate(String(val), 40);
    }

    html += `<div class="brain-detail-field">
      <div class="brain-detail-label">${escHtml(displayKey)}</div>
      <div class="brain-detail-value" style="white-space: pre-wrap; word-break: break-word; user-select: text">${escHtml(String(displayVal ?? '-'))}</div>
    </div>`;
  }

  html += '</div>';
  detailTitle.textContent = title || (row.id as string);
  detailDelete.dataset.name = title || (row.id as string);
  detailBody.innerHTML = html;
  openDetail();
}

/* ── Detail Panel Toggle ─────────────────────────────────────────── */
function openDetail() {
  detailPanel.classList.add('open');
}

function closeDetail() {
  detailPanel.classList.remove('open');
  selectedId = null;
  tableBody.querySelectorAll('tr.selected').forEach((tr) => tr.classList.remove('selected'));
}

detailClose.addEventListener('click', closeDetail);

/* ── Delete Flow ─────────────────────────────────────────────────── */
detailDelete.addEventListener('click', () => {
  const table = detailDelete.dataset.table;
  const id = detailDelete.dataset.id;
  const name = detailDelete.dataset.name || id;

  deleteDialogText.innerHTML = `Delete <span class="brain-dialog-name">${escHtml(name)}</span>?`;
  deleteDialogWarning.textContent =
    table === 'entities'
      ? 'This will also delete all related relations and embeddings.'
      : table === 'agent_conversations'
        ? 'This will also delete all messages in this conversation.'
        : '';

  deleteDialog.classList.add('visible');
  deleteConfirm.dataset.table = table;
  deleteConfirm.dataset.id = id;
});

deleteCancel.addEventListener('click', () => {
  deleteDialog.classList.remove('visible');
});

deleteConfirm.addEventListener('click', async () => {
  const table = deleteConfirm.dataset.table;
  const id = deleteConfirm.dataset.id;
  deleteDialog.classList.remove('visible');

  await invoke('brain_delete', { table, id });
  libraryDirty = true;
  closeDetail();
  currentOffset = 0;
  await loadData();
  await loadStats();
});

/* ── Keyboard ────────────────────────────────────────────────────── */
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (deleteDialog.classList.contains('visible')) {
      deleteDialog.classList.remove('visible');
      e.stopImmediatePropagation();
      return;
    }
    if (detailPanel.classList.contains('open')) {
      closeDetail();
      e.stopImmediatePropagation();
      return;
    }
  }

  if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
    e.preventDefault();
    if (currentView === 'graph' && graphMode === 'library') {
      librarySearchInput.focus();
      librarySearchInput.select();
    } else {
      searchInput.focus();
      searchInput.select();
    }
  }
});

/* ── 3D Brain Visualization ──────────────────────────────────────── */

async function loadBrain3D(): Promise<void> {
  const graphEmpty = document.getElementById('graph-empty') as HTMLDivElement;
  try {
    type ListResult = { rows: Array<Record<string, unknown>>; total: number };
    const [entityResult, relationResult] = await Promise.all([
      invoke<ListResult>('brain_list_entities', { opts: { limit: 500 } }),
      invoke<ListResult>('brain_list_relations', { opts: { limit: 1000 } }),
    ]);

    const entities = entityResult.rows;
    const relations = relationResult.rows;

    if (entities.length === 0) {
      graphEmpty.style.display = 'flex';
      brain3dContainer.style.display = 'none';
      graphStats.textContent = '';
      return;
    }

    graphEmpty.style.display = 'none';
    brain3dContainer.style.display = '';

    const idToIndex = new Map<string, number>();
    const nodes: BrainNode[] = entities.map((e, i) => {
      idToIndex.set(e.id as string, i);
      return {
        id: e.id as string,
        name: (e.name as string) || (e.id as string),
        type: (e.type as string) || 'concept',
        importance: typeof e.importance_score === 'number' ? e.importance_score : 0.3,
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
      };
    });

    const edges: BrainEdge[] = relations
      .filter(
        (r) => idToIndex.has(r.from_entity_id as string) && idToIndex.has(r.to_entity_id as string),
      )
      .map((r) => ({
        from: idToIndex.get(r.from_entity_id as string)!,
        to: idToIndex.get(r.to_entity_id as string)!,
        type: r.type as string,
        strength: typeof r.strength === 'number' ? r.strength : 0.5,
      }));

    graphStats.textContent = `${nodes.length} entities \u00b7 ${edges.length} relations`;

    disposeScene();
    initScene(brain3dContainer, brain3dTooltip, nodes, edges, {
      onNodeClick: (id: string) => showEntityDetail(id),
      onNodeHover: () => {},
    });
  } catch {
    graphEmpty.style.display = 'flex';
    brain3dContainer.style.display = 'none';
    graphStats.textContent = '';
  }
}

/* ── View Toggle ─────────────────────────────────────────────────── */
viewToggle.querySelectorAll('.brain-view-seg').forEach((btn) => {
  btn.addEventListener('click', () => {
    const mode = (btn as HTMLButtonElement).dataset.mode;
    if (mode === graphMode) return;
    if (mode) setGraphMode(mode);
  });
});

function setGraphMode(mode: string) {
  graphMode = mode;

  viewToggle.dataset.active = mode;
  viewToggle
    .querySelectorAll('.brain-view-seg')
    .forEach((s) => s.classList.toggle('active', (s as HTMLButtonElement).dataset.mode === mode));

  const isBrain = mode === 'brain';
  brain3dContainer.style.display = isBrain ? '' : 'none';
  graphStats.style.display = isBrain ? '' : 'none';
  (document.getElementById('graph-empty') as HTMLDivElement).style.display = 'none';
  libraryView.style.display = isBrain ? 'none' : '';

  if (isBrain) {
    loadBrain3D();
  } else {
    disposeScene();
    loadLibrary();
  }
}

/* ── Library Cover Flow ────────────────────────────────────────── */
const TYPE_COLORS: Record<string, string> = {
  person: '#3b82f6',
  project: '#34d399',
  company: '#a78bfa',
  event: '#f59e0b',
  document: '#6b7280',
  goal: '#038b9a',
  place: '#eab308',
  concept: '#ec4899',
};
async function loadLibrary() {
  if (!libraryDirty && libraryEntities.length > 0) {
    applyLibraryFilter();
    return;
  }

  try {
    const result: { rows: Array<Record<string, unknown>>; total: number } = await invoke(
      'brain_list_entities',
      { opts: { limit: 200 } },
    );
    libraryEntities = result.rows;
    libraryDirty = false;
    applyLibraryFilter();
  } catch {
    libraryEntities = [];
    libraryFiltered = [];
    renderLibraryCards();
  }
}

function applyLibraryFilter() {
  const search = librarySearchInput.value.trim().toLowerCase();
  if (!search) {
    libraryFiltered = libraryEntities.slice();
  } else {
    libraryFiltered = libraryEntities.filter(
      (e) =>
        (e.name && (e.name as string).toLowerCase().includes(search)) ||
        (e.type && (e.type as string).toLowerCase().includes(search)) ||
        (e.summary && (e.summary as string).toLowerCase().includes(search)),
    );
  }

  if (libraryFiltered.length === 0) {
    libActiveIndex = 0;
  } else {
    libActiveIndex = Math.min(libActiveIndex, libraryFiltered.length - 1);
  }
  libCurrentIndex = libActiveIndex;
  libVelocity = 0;

  renderLibraryCards();
}

function renderLibraryCards() {
  libraryTrack.innerHTML = '';

  if (libraryFiltered.length === 0) {
    libraryEmpty.style.display = 'flex';
    return;
  }
  libraryEmpty.style.display = 'none';

  libraryFiltered.forEach((entity, i) => {
    const card = document.createElement('div');
    card.className = 'brain-library-card';
    card.dataset.index = String(i);
    card.dataset.entityId = entity.id as string;

    const color = TYPE_COLORS[entity.type as string] || '#666';
    const initial = ((entity.name as string) || '?').charAt(0).toUpperCase();
    const score =
      typeof entity.importance_score === 'number'
        ? Math.round(entity.importance_score * 100) + '%'
        : '';

    card.innerHTML =
      '<div class="brain-library-card-dot" style="background:' +
      color +
      '22;color:' +
      color +
      '">' +
      escHtml(initial) +
      '</div>' +
      '<div class="brain-library-card-name">' +
      escHtml((entity.name as string) || (entity.id as string)) +
      '</div>' +
      '<span class="brain-library-card-type type-badge type-' +
      escHtml(entity.type) +
      '">' +
      escHtml(entity.type) +
      '</span>' +
      '<div class="brain-library-card-summary">' +
      escHtml(truncate((entity.summary as string) || '', 120)) +
      '</div>' +
      '<div class="brain-library-card-meta">' +
      (score ? score + ' importance' : '') +
      (entity.last_updated_at ? ' \u00b7 ' + formatTs(entity.last_updated_at as string) : '') +
      '</div>';

    libraryTrack.appendChild(card);
  });

  updateLibraryTransforms();
}

function updateLibraryTransforms() {
  const cards = libraryTrack.querySelectorAll('.brain-library-card');
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i] as HTMLDivElement;
    const offset = i - libCurrentIndex;
    const absOffset = Math.abs(offset);
    const sign = offset > 0 ? 1 : -1;

    const translateX = offset * 220;
    const translateZ = 80 - absOffset * 160;
    const rotateY = absOffset < 0.01 ? 0 : -sign * Math.min(absOffset, 1.2) * 45;
    const scale = Math.max(0.82, 1.06 - absOffset * 0.14);
    const opacity = Math.max(0, 1 - absOffset * 0.28);
    const zIndex = Math.max(0, 10 - Math.round(absOffset));

    card.style.transform =
      'translateX(' +
      translateX +
      'px) translateZ(' +
      translateZ +
      'px) rotateY(' +
      rotateY +
      'deg) scale(' +
      scale +
      ')';
    card.style.opacity = String(opacity);
    card.style.zIndex = String(zIndex);
    card.style.pointerEvents = absOffset > 3 ? 'none' : 'auto';
  }
}

function libSpringTick() {
  const stiffness = 0.06;
  const damping = 0.78;

  const force = (libActiveIndex - libCurrentIndex) * stiffness;
  libVelocity = (libVelocity + force) * damping;
  libCurrentIndex += libVelocity;

  if (Math.abs(libCurrentIndex - libActiveIndex) < 0.002 && Math.abs(libVelocity) < 0.002) {
    libCurrentIndex = libActiveIndex;
    libVelocity = 0;
    libAnimating = false;
    updateLibraryTransforms();
    return;
  }

  updateLibraryTransforms();
  requestAnimationFrame(libSpringTick);
}

function startLibAnimation() {
  if (!libAnimating) {
    libAnimating = true;
    requestAnimationFrame(libSpringTick);
  }
}

/* ── Library Events ────────────────────────────────────────────── */
libraryView.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    e.stopPropagation();
    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    libScrollAccum += delta;

    if (libScrollTimer) clearTimeout(libScrollTimer);
    libScrollTimer = setTimeout(() => {
      libScrollAccum = 0;
    }, 150);

    if (Math.abs(libScrollAccum) >= LIB_SCROLL_THRESHOLD) {
      const steps = Math.round(libScrollAccum / LIB_SCROLL_THRESHOLD);
      libActiveIndex = Math.max(0, Math.min(libraryFiltered.length - 1, libActiveIndex + steps));
      libScrollAccum = libScrollAccum % LIB_SCROLL_THRESHOLD;
      startLibAnimation();
    }
  },
  { passive: false },
);

libraryTrack.addEventListener('click', (e) => {
  const card = (e.target as HTMLElement).closest('.brain-library-card') as HTMLDivElement | null;
  if (!card) return;
  const idx = parseInt(card.dataset.index!, 10);
  if (idx !== libActiveIndex) {
    libActiveIndex = idx;
    startLibAnimation();
  } else {
    const entityId = card.dataset.entityId;
    if (entityId) showEntityDetail(entityId);
  }
});

document.addEventListener('keydown', (e) => {
  if (currentView !== 'graph' || graphMode !== 'library') return;
  if (document.activeElement === librarySearchInput) return;

  if (e.key === 'ArrowLeft') {
    e.preventDefault();
    if (libActiveIndex > 0) {
      libActiveIndex--;
      startLibAnimation();
    }
  } else if (e.key === 'ArrowRight') {
    e.preventDefault();
    if (libActiveIndex < libraryFiltered.length - 1) {
      libActiveIndex++;
      startLibAnimation();
    }
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const entity = libraryFiltered[libActiveIndex];
    if (entity) showEntityDetail(entity.id as string);
  }
});

librarySearchInput.addEventListener('input', () => {
  if (libSearchTimeout) clearTimeout(libSearchTimeout);
  libSearchTimeout = setTimeout(applyLibraryFilter, 200);
});

librarySearchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    librarySearchInput.value = '';
    librarySearchInput.blur();
    applyLibraryFilter();
    e.stopPropagation();
  }
});

/* ── In-Palette Mode ─────────────────────────────────────────────── */
const isInPalette = new URLSearchParams(window.location.search).has('inPalette');

if (isInPalette) {
  document.documentElement.style.background = 'transparent';
  document.body.classList.add('in-palette');
  (document.getElementById('palette-back') as HTMLButtonElement).addEventListener('click', () => {
    invoke('navigate_back');
  });
}

/* ── Keyboard ── override for in-palette Escape ────────────────── */
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && isInPalette) {
    if (deleteDialog.classList.contains('visible')) return;
    if (detailPanel.classList.contains('open')) return;
    e.preventDefault();
    invoke('navigate_back');
  }
});

/* ── Init ────────────────────────────────────────────────────────── */
async function init() {
  await loadStats();
  console.log('[brain] stats loaded:', JSON.stringify(stats));
  const hasEntities = stats !== null && typeof stats.entities === 'number' && stats.entities > 0;
  const hasConversations =
    stats !== null && typeof stats.conversations === 'number' && stats.conversations > 0;
  const defaultView = hasEntities || !hasConversations ? 'entities' : 'conversations';
  console.log('[brain] defaulting to:', defaultView);
  switchView(defaultView);
}

init();
