import { html } from 'lit';
import { customElement } from 'lit/decorators.js';
import { invoke } from '@tauri-apps/api/core';
import { LightDomElement } from '../shared/light-dom-element.js';
import { adoptGlobalStyles, adoptStyles } from '../shared/styles/inject.js';
import {
  brainLayoutStyles,
  brainTableStyles,
  brainDetailStyles,
  brainDetailContentStyles,
  brainDialogStyles,
  brainGraphStyles,
  brainViewToggleStyles,
  brainLibraryStyles,
  brainResponsiveStyles,
} from './styles/index.js';
import { t, applyTranslations, initLocale } from '../i18n.js';
import { escHtml } from './brain-helpers.js';
import { brainGetStats } from './ipc.js';
import type { ViewConfig } from './brain-view-config.js';
import { VIEW_CONFIG } from './brain-view-config.js';
import { BrainDetailController } from './brain-detail-controller.js';
import { BrainGraphController } from './brain-graph-controller.js';
import { BrainLibraryController } from './brain-library-controller.js';

adoptGlobalStyles();
adoptStyles(
  brainLayoutStyles,
  brainTableStyles,
  brainDetailStyles,
  brainDetailContentStyles,
  brainDialogStyles,
  brainGraphStyles,
  brainViewToggleStyles,
  brainLibraryStyles,
  brainResponsiveStyles,
);

const PAGE_SIZE = 50;

@customElement('sauria-brain')
export class SauriaBrain extends LightDomElement {
  private currentView = 'entities';
  private currentRows: Array<Record<string, unknown>> = [];
  private currentTotal = 0;
  private currentOffset = 0;
  private searchTimeout: ReturnType<typeof setTimeout> | null = null;
  private stats: Record<string, number> | null = null;
  private graphMode = 'brain';

  private detail!: BrainDetailController;
  private graph!: BrainGraphController;
  private library!: BrainLibraryController;

  private readonly $ = <T extends HTMLElement>(id: string) => this.querySelector<T>(`#${id}`) as T;

  override render() {
    return this.renderLayout();
  }

  override async firstUpdated() {
    await initLocale();
    applyTranslations();

    const onEntitySelect = (id: string) => this.detail.showEntity(id);
    this.detail = new BrainDetailController(this, this.handleDataChanged);
    this.graph = new BrainGraphController(
      this.$<HTMLCanvasElement>('graph-canvas'),
      this.$<HTMLDivElement>('graph-wrap'),
      this.$<HTMLDivElement>('graph-empty'),
      this.$<HTMLDivElement>('graph-stats'),
      onEntitySelect,
    );
    this.library = new BrainLibraryController(
      this.$<HTMLDivElement>('library-view'),
      this.$<HTMLDivElement>('library-track'),
      this.$<HTMLDivElement>('library-empty'),
      this.$<HTMLInputElement>('library-search-input'),
      onEntitySelect,
    );

    this.bindEvents();
    this.initPalette();
    await this.loadStats();
    this.switchView('entities');
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this.graph?.dispose();
    window.removeEventListener('resize', this.handleResize);
    document.removeEventListener('keydown', this.handleKeyDown);
    if (this.searchTimeout) clearTimeout(this.searchTimeout);
  }

  private readonly handleDataChanged = () => {
    this.library.markDirty();
    this.currentOffset = 0;
    this.loadData();
    this.loadStats();
  };

  private async loadStats() {
    const statsBar = this.$<HTMLDivElement>('stats-bar');
    try {
      this.stats = await brainGetStats();
      this.renderStatsBar();
      this.updateNavCounts();
    } catch {
      statsBar.innerHTML =
        '<div class="brain-stat"><span style="color: var(--error)">' +
        t('brain.connectError') +
        '</span></div>';
    }
  }

  private renderStatsBar() {
    if (!this.stats) return;
    const statsBar = this.$<HTMLDivElement>('stats-bar');
    let h =
      `<div class="brain-stat"><span class="brain-stat-value">${this.stats['entities']}</span> ${t('brain.statEntities')}</div>` +
      `<div class="brain-stat"><span class="brain-stat-value">${this.stats['relations']}</span> ${t('brain.statRelations')}</div>` +
      `<div class="brain-stat"><span class="brain-stat-value">${this.stats['events']}</span> ${t('brain.statEvents')}</div>` +
      `<div class="brain-stat"><span class="brain-stat-value">${this.stats['observations']}</span> ${t('brain.statObservations')}</div>` +
      `<div class="brain-stat"><span class="brain-stat-value">${this.stats['conversations']}</span> ${t('brain.statConversations')}</div>` +
      `<div class="brain-stat"><span class="brain-stat-value">${this.stats['facts']}</span> ${t('brain.statFacts')}</div>`;

    if (this.stats['entities'] === 0 && this.stats['events'] > 0) {
      const hint =
        this.stats['extractionFailures'] > 0
          ? t('brain.extractionError').replace('{0}', String(this.stats['extractionFailures']))
          : t('brain.noExtractHint');
      h += `<div class="brain-stat" style="color: var(--text-dim); font-size: var(--font-size-x-small); flex-basis: 100%">${hint}</div>`;
    }
    statsBar.innerHTML = h;
  }

  private updateNavCounts() {
    if (!this.stats) return;
    for (const id of [
      'entities',
      'relations',
      'events',
      'observations',
      'conversations',
      'facts',
    ]) {
      const el = this.querySelector(`#nav-count-${id}`);
      if (el) el.textContent = String(this.stats[id]);
    }
  }

  private switchView(view: string) {
    this.currentView = view;
    this.currentOffset = 0;
    this.currentRows = [];
    this.detail.close();

    this.querySelectorAll('.brain-nav-item').forEach((n) =>
      n.classList.toggle('active', (n as HTMLElement).dataset['view'] === view),
    );

    const isGraph = view === 'graph';
    this.$('graph-wrap').style.display = isGraph ? '' : 'none';
    this.$('table-wrap').style.display = isGraph ? 'none' : '';
    (this.querySelector('.brain-toolbar') as HTMLElement).style.display = isGraph ? 'none' : '';
    this.$('stats-bar').style.display = isGraph ? 'none' : '';

    if (isGraph) {
      if (this.graphMode === 'brain') this.graph.load();
      else this.library.load();
      this.setGraphMode(this.graphMode);
      return;
    }

    const cfg = VIEW_CONFIG[view] as ViewConfig;
    const searchInput = this.$<HTMLInputElement>('search-input');
    const filterSelect = this.$<HTMLSelectElement>('filter-select');
    searchInput.value = '';
    searchInput.placeholder = t('brain.searchView').replace('{0}', view);
    searchInput.disabled = false;

    const filterOpts = cfg.filterOptions();
    if (cfg.hasFilter && filterOpts.length > 0) {
      filterSelect.style.display = '';
      filterSelect.innerHTML = filterOpts
        .map((o) => `<option value="${escHtml(o.value)}">${escHtml(o.label)}</option>`)
        .join('');
    } else {
      filterSelect.style.display = 'none';
    }

    this.renderTableHead(cfg.columns());
    this.loadData();
  }

  private renderTableHead(columns: string[]) {
    this.$('table-head').innerHTML =
      '<tr>' + columns.map((c) => `<th>${escHtml(c)}</th>`).join('') + '</tr>';
  }

  private renderTableRows(rows: Array<Record<string, unknown>>, append?: boolean) {
    const cfg = VIEW_CONFIG[this.currentView] as ViewConfig;
    const tableBody = this.$<HTMLTableSectionElement>('table-body');
    if (!append) tableBody.innerHTML = '';

    for (const r of rows) {
      const tr = document.createElement('tr');
      tr.dataset['id'] = r.id as string;
      tr.innerHTML = cfg.renderRow(r);
      if (r.id === this.detail.getSelectedId()) tr.classList.add('selected');
      tr.addEventListener('click', () => this.handleRowClick(r));
      tableBody.appendChild(tr);
    }

    this.$('empty-state').style.display = this.currentRows.length === 0 ? 'flex' : 'none';
    this.$('load-more').style.display = this.currentRows.length < this.currentTotal ? '' : 'none';
  }

  private async loadData(append?: boolean) {
    const cfg = VIEW_CONFIG[this.currentView] as ViewConfig;
    const searchInput = this.$<HTMLInputElement>('search-input');
    const filterSelect = this.$<HTMLSelectElement>('filter-select');
    const opts: Record<string, unknown> = { offset: this.currentOffset, limit: PAGE_SIZE };

    if (cfg.hasSearch && searchInput.value.trim()) opts['search'] = searchInput.value.trim();
    if (cfg.hasFilter && filterSelect.value) {
      if (this.currentView === 'entities') opts['type'] = filterSelect.value;
      else if (this.currentView === 'observations') opts['type'] = filterSelect.value;
      else if (this.currentView === 'events') opts['source'] = filterSelect.value;
      else if (this.currentView === 'conversations') opts['platform'] = filterSelect.value;
    }

    try {
      const result = await cfg.load(opts);
      this.currentRows = append ? this.currentRows.concat(result.rows) : result.rows;
      this.currentTotal = result.total;
      this.renderTableRows(append ? result.rows : this.currentRows, append);
    } catch (err) {
      console.error(`[brain] loadData failed for view="${this.currentView}":`, err);
      if (!append) {
        this.$('table-body').innerHTML = '';
        this.$('empty-state').style.display = 'flex';
        const div = this.$('empty-state').querySelector('div');
        if (div) div.textContent = t('brain.error');
      }
    }
  }

  private handleRowClick(row: Record<string, unknown>) {
    this.$('table-body')
      .querySelectorAll('tr')
      .forEach((tr) => tr.classList.toggle('selected', tr.dataset['id'] === (row.id as string)));

    if (this.currentView === 'entities') this.detail.showEntity(row.id as string);
    else if (this.currentView === 'conversations') this.detail.showConversation(row);
    else this.detail.showGeneric(row, (VIEW_CONFIG[this.currentView] as ViewConfig).tableName);
  }

  private setGraphMode(mode: string) {
    this.graphMode = mode;
    const viewToggle = this.$('view-toggle');
    viewToggle.dataset['active'] = mode;
    viewToggle
      .querySelectorAll('.brain-view-seg')
      .forEach((s) =>
        s.classList.toggle('active', (s as HTMLButtonElement).dataset['mode'] === mode),
      );

    const isBrain = mode === 'brain';
    this.$<HTMLCanvasElement>('graph-canvas').style.display = isBrain ? 'block' : 'none';
    this.$('graph-controls').style.display = isBrain ? 'flex' : 'none';
    this.$('graph-stats').style.display = isBrain ? '' : 'none';
    this.$('graph-empty').style.display = 'none';
    this.$('library-view').style.display = isBrain ? 'none' : '';

    if (isBrain) this.graph.resume();
    else this.library.load();
  }

  private bindEvents() {
    this.querySelectorAll('.brain-nav-item').forEach((item) => {
      item.addEventListener('click', () => {
        const view = (item as HTMLElement).dataset['view'];
        if (view && view !== this.currentView) this.switchView(view);
      });
    });

    const searchInput = this.$<HTMLInputElement>('search-input');
    const filterSelect = this.$<HTMLSelectElement>('filter-select');

    searchInput.addEventListener('input', () => {
      if (this.searchTimeout) clearTimeout(this.searchTimeout);
      this.searchTimeout = setTimeout(() => {
        this.currentOffset = 0;
        this.loadData();
      }, 300);
    });

    filterSelect.addEventListener('change', () => {
      this.currentOffset = 0;
      this.loadData();
    });

    this.$('load-more-btn').addEventListener('click', () => {
      this.currentOffset += PAGE_SIZE;
      this.loadData(true);
    });

    this.$('view-toggle')
      .querySelectorAll('.brain-view-seg')
      .forEach((btn) => {
        btn.addEventListener('click', () => {
          const mode = (btn as HTMLButtonElement).dataset['mode'];
          if (mode && mode !== this.graphMode) this.setGraphMode(mode);
        });
      });

    this.$('graph-zoom-in').addEventListener('click', () => this.graph.zoomIn());
    this.$('graph-zoom-out').addEventListener('click', () => this.graph.zoomOut());
    this.$('graph-zoom-reset').addEventListener('click', () => this.graph.zoomReset());

    window.addEventListener('resize', this.handleResize);
    document.addEventListener('keydown', this.handleKeyDown);
  }

  private readonly handleResize = () => {
    if (this.currentView === 'graph') {
      this.graph.resize();
      this.graph.redrawIfSettled();
    }
  };

  private readonly handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (this.detail.isDeleteDialogOpen()) {
        this.detail.hideDeleteDialog();
        e.stopImmediatePropagation();
        return;
      }
      if (this.detail.isOpen()) {
        this.detail.close();
        this.$('table-body')
          .querySelectorAll('tr.selected')
          .forEach((tr) => tr.classList.remove('selected'));
        e.stopImmediatePropagation();
        return;
      }
    }

    if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
      e.preventDefault();
      if (this.currentView === 'graph' && this.graphMode === 'library') {
        this.$<HTMLInputElement>('library-search-input').focus();
        this.$<HTMLInputElement>('library-search-input').select();
      } else {
        this.$<HTMLInputElement>('search-input').focus();
        this.$<HTMLInputElement>('search-input').select();
      }
    }

    if (this.currentView === 'graph' && this.graphMode === 'library') {
      this.library.handleKeyDown(e);
    }
  };

  private initPalette() {
    document.documentElement.style.background = 'transparent';
    this.$('palette-back').addEventListener('click', () => invoke('navigate_back'));

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.detail.isDeleteDialogOpen() && !this.detail.isOpen()) {
        e.preventDefault();
        invoke('navigate_back');
      }
    });
  }

  private renderLayout() {
    // prettier-ignore
    return html`
<div class="brain-layout">
  <nav class="brain-sidebar">
    <button class="palette-back" id="palette-back" title="Back">
      <img src="/icons/chevron-left.svg" alt="" />
    </button>
    <div class="brain-sidebar-section">
      <div class="brain-nav-item" data-view="graph">
        <img class="icon-mono" src="/icons/share-2.svg" alt="" />
        <span data-i18n="brain.graph">Graph</span>
      </div>
    </div>
    <div class="brain-sidebar-section">
      <div class="brain-sidebar-section-label" data-i18n="brain.knowledge">Knowledge</div>
      <div class="brain-nav-item active" data-view="entities">
        <img class="icon-mono" src="/icons/user.svg" alt="" />
        <span data-i18n="brain.entities">Entities</span>
        <span class="brain-nav-count" id="nav-count-entities">0</span>
      </div>
      <div class="brain-nav-item" data-view="relations">
        <img class="icon-mono" src="/icons/link.svg" alt="" />
        <span data-i18n="brain.relations">Relations</span>
        <span class="brain-nav-count" id="nav-count-relations">0</span>
      </div>
      <div class="brain-nav-item" data-view="events">
        <img class="icon-mono" src="/icons/calendar.svg" alt="" />
        <span data-i18n="brain.events">Events</span>
        <span class="brain-nav-count" id="nav-count-events">0</span>
      </div>
      <div class="brain-nav-item" data-view="observations">
        <img class="icon-mono" src="/icons/lightbulb.svg" alt="" />
        <span data-i18n="brain.observations">Observations</span>
        <span class="brain-nav-count" id="nav-count-observations">0</span>
      </div>
    </div>
    <div class="brain-sidebar-section">
      <div class="brain-sidebar-section-label" data-i18n="brain.activity">Activity</div>
      <div class="brain-nav-item" data-view="conversations">
        <img class="icon-mono" src="/icons/message-square.svg" alt="" />
        <span data-i18n="brain.conversations">Conversations</span>
        <span class="brain-nav-count" id="nav-count-conversations">0</span>
      </div>
      <div class="brain-nav-item" data-view="facts">
        <img class="icon-mono" src="/icons/brain.svg" alt="" />
        <span data-i18n="brain.agentMemory">Agent Memory</span>
        <span class="brain-nav-count" id="nav-count-facts">0</span>
      </div>
    </div>
  </nav>

  <main class="brain-content" id="brain-content">
    <div class="brain-toolbar">
      <div class="brain-search">
        <img src="/icons/search.svg" alt="" />
        <input type="text" id="search-input" placeholder="Search..." data-i18n-placeholder="brain.search" />
      </div>
      <select class="brain-filter" id="filter-select" style="display: none">
        <option value="" data-i18n="brain.allTypes">All types</option>
      </select>
    </div>
    <div class="brain-stats" id="stats-bar"></div>

    <div class="brain-graph-wrap" id="graph-wrap" style="display: none">
      <div class="brain-view-toggle" id="view-toggle">
        <div class="brain-view-highlight" id="view-highlight"></div>
        <button class="brain-view-seg active" data-mode="brain" data-i18n="brain.brainView">Brain</button>
        <button class="brain-view-seg" data-mode="library" data-i18n="brain.libraryView">Library</button>
      </div>
      <canvas id="graph-canvas"></canvas>
      <div class="brain-graph-empty" id="graph-empty" style="display: none">
        <img class="icon-mono" src="/icons/share-2.svg" alt="" />
        <div data-i18n="brain.noEntities">No entities yet</div>
        <div style="font-size: var(--font-size-small)" data-i18n="brain.entitiesHint">Entities will appear here as Sauria learns from your conversations</div>
      </div>
      <div class="brain-library" id="library-view" style="display: none">
        <div class="brain-library-track" id="library-track" style="perspective: 1200px"></div>
        <div class="brain-library-empty" id="library-empty" style="display: none">
          <img class="icon-mono" src="/icons/database.svg" alt="" />
          <div data-i18n="brain.noEntities">No entities yet</div>
          <div style="font-size: var(--font-size-small)" data-i18n="brain.entitiesHint">Entities will appear here as Sauria learns from your conversations</div>
        </div>
        <div class="brain-library-search" id="library-search">
          <img class="icon-mono" src="/icons/search.svg" alt="" />
          <input type="text" id="library-search-input" placeholder="Search entities..." data-i18n-placeholder="brain.searchEntities" />
        </div>
      </div>
      <div class="brain-graph-controls" id="graph-controls">
        <button class="brain-graph-btn" id="graph-zoom-out" title="Zoom out">&minus;</button>
        <button class="brain-graph-btn" id="graph-zoom-in" title="Zoom in">+</button>
        <button class="brain-graph-btn" id="graph-zoom-reset" title="Reset">&#8634;</button>
      </div>
      <div class="brain-graph-stats" id="graph-stats"></div>
    </div>

    <div class="brain-table-wrap" id="table-wrap">
      <table class="brain-table" id="data-table">
        <thead id="table-head"></thead>
        <tbody id="table-body"></tbody>
      </table>
      <div class="brain-empty" id="empty-state" style="display: none">
        <img src="/icons/database.svg" alt="" />
        <div data-i18n="brain.noData">No data yet</div>
        <div style="font-size: var(--font-size-small)" data-i18n="brain.dataHint">This will fill up as Sauria learns from your conversations</div>
      </div>
      <div class="brain-load-more" id="load-more" style="display: none">
        <button id="load-more-btn" data-i18n="brain.loadMore">Load more</button>
      </div>
    </div>
  </main>

  <aside class="brain-detail" id="detail-panel">
    <div class="brain-detail-header">
      <span class="brain-detail-title" id="detail-title"></span>
      <div class="brain-detail-close" id="detail-close"><img src="/icons/x.svg" alt="Close" /></div>
    </div>
    <div class="brain-detail-body" id="detail-body"></div>
    <div class="brain-detail-actions" id="detail-actions">
      <button class="btn btn-danger" id="detail-delete" data-i18n="brain.delete">Delete</button>
    </div>
  </aside>
</div>

<div class="brain-dialog-overlay" id="delete-dialog">
  <div class="brain-dialog">
    <div class="brain-dialog-header">
      <div class="brain-dialog-title" data-i18n="brain.confirmDelete">Confirm Delete</div>
      <button class="dialog-close btn-icon" id="delete-dialog-close">
        <img src="/icons/x.svg" alt="Close" />
      </button>
    </div>
    <div class="brain-dialog-text" id="delete-dialog-text"></div>
    <div class="brain-dialog-warning" id="delete-dialog-warning"></div>
    <div class="brain-dialog-actions">
      <button class="btn btn-secondary" id="delete-cancel" data-i18n="common.cancel">Cancel</button>
      <button class="btn btn-danger" id="delete-confirm" data-i18n="common.delete">Delete</button>
    </div>
  </div>
</div>`;
  }
}
