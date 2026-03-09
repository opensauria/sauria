import { html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { LightDomElement } from '../shared/light-dom-element.js';
import { adoptGlobalStyles, adoptStyles } from '../shared/styles/inject.js';
import { integrationStyles } from './styles.js';
import type { IntegrationStatus, TelegramBot } from '../shared/types.js';
import {
  invokeWithRetry,
  getTelegramStatus,
  getIntegrationAccounts,
  navigateBack,
} from '../shared/ipc.js';
import { ACRONYMS } from '../shared/utils.js';
import { t, initLocale, applyTranslations } from '../i18n.js';

adoptGlobalStyles();
adoptStyles(...integrationStyles);

import './integration-card.js';
import './integration-category-tabs.js';
import './integration-config-panel.js';
import type { IntegrationConfigPanel } from './integration-config-panel.js';

const CATEGORY_ORDER = [
  { id: 'all', labelKey: 'integ.catAll' },
  { id: 'communication', labelKey: 'integ.catCommunication' },
  { id: 'project_management', labelKey: 'integ.catProjectMgmt' },
  { id: 'development', labelKey: 'integ.catDevelopment' },
  { id: 'productivity', labelKey: 'integ.catProductivity' },
  { id: 'infrastructure', labelKey: 'integ.catInfrastructure' },
  { id: 'monitoring', labelKey: 'integ.catMonitoring' },
  { id: 'ecommerce', labelKey: 'integ.catEcommerce' },
  { id: 'design', labelKey: 'integ.catDesign' },
  { id: 'data', labelKey: 'integ.catData' },
  { id: 'crm', labelKey: 'integ.catCRM' },
  { id: 'support', labelKey: 'integ.catSupport' },
  { id: 'automation', labelKey: 'integ.catAutomation' },
  { id: 'social', labelKey: 'integ.catSocial' },
  { id: 'marketing', labelKey: 'integ.catMarketing' },
  { id: 'cms', labelKey: 'integ.catCMS' },
  { id: 'content', labelKey: 'integ.catContent' },
  { id: 'storage', labelKey: 'integ.catStorage' },
] as const;

const TELEGRAM_CARD = {
  id: 'telegram',
  name: 'Telegram',
  description: 'Messaging channel for agent communication',
  icon: 'telegram',
  category: 'communication',
} as const;

@customElement('sauria-integrations')
export class SauriaIntegrations extends LightDomElement {
  @state() private catalog: IntegrationStatus[] = [];
  @state() private telegramBots: readonly TelegramBot[] = [];
  @state() private accountLabels: Record<string, string> = {};
  @state() private searchQuery = '';
  @state() private activeCategory = 'all';
  @state() private openPanelId: string | null = null;
  @state() private ready = false;

  private unlistenOauth?: UnlistenFn;

  override connectedCallback() {
    super.connectedCallback();
    this.init();
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this.unlistenOauth?.();
  }

  private async init() {
    await initLocale();
    applyTranslations();

    const [mcpCatalog, tgStatus, labels] = await Promise.all([
      invokeWithRetry<IntegrationStatus[]>('integrations_list_catalog').catch(
        () => [] as IntegrationStatus[],
      ),
      invokeWithRetry<{ bots: TelegramBot[] }>('get_telegram_status').catch(() => ({
        bots: [] as TelegramBot[],
      })),
      invokeWithRetry<Record<string, string>>('get_integration_accounts').catch(
        () => ({}) as Record<string, string>,
      ),
    ]);

    this.catalog = mcpCatalog;
    this.telegramBots = tgStatus.bots ?? [];
    this.accountLabels = labels;
    this.ready = true;

    this.unlistenOauth = await listen<{ accountLabel?: string; integrationId?: string }>(
      'integration-oauth-complete',
      async (event) => {
        const { accountLabel, integrationId } = event.payload;
        if (accountLabel && integrationId) {
          this.accountLabels = { ...this.accountLabels, [integrationId]: accountLabel };
        }
        await this.refreshCatalog();

        const panel = this.querySelector<IntegrationConfigPanel>('integration-config-panel');
        panel?.setOAuthSuccess();

        setTimeout(() => {
          if (this.openPanelId) {
            const updated = this.catalog.find((c) => c.id === this.openPanelId);
            if (updated?.connected) this.requestUpdate();
          }
        }, 800);
      },
    );
  }

  override render() {
    if (!this.ready) {
      return html` <div class="integrations-loading"><div class="spinner"></div></div> `;
    }

    const filtered = this.getFilteredItems();
    const presentCategories = this.getPresentCategories();
    const visibleTabs = CATEGORY_ORDER.filter(
      (cat) => cat.id === 'all' || presentCategories.has(cat.id),
    );
    const openItem =
      this.openPanelId && this.openPanelId !== 'telegram'
        ? (this.catalog.find((c) => c.id === this.openPanelId) ?? null)
        : null;

    return html`
      <header class="integrations-header" data-tauri-drag-region>
        <button
          class="palette-back"
          data-i18n-title="common.back"
          title="Back"
          @click=${() => navigateBack()}
        >
          <img src="/icons/chevron-left.svg" alt="" />
        </button>
        <h1 class="integrations-title" data-i18n="integ.title">${t('integ.title')}</h1>
        <div class="integrations-search">
          <img src="/icons/search.svg" alt="" />
          <input
            type="text"
            data-i18n-placeholder="integ.search"
            placeholder="${t('integ.search')}"
            autocomplete="off"
            .value=${this.searchQuery}
            @input=${this.handleSearch}
          />
        </div>
      </header>

      <nav class="category-tabs">
        <integration-category-tabs
          .tabs=${visibleTabs}
          .activeCategory=${this.activeCategory}
          @category-change=${this.handleCategoryChange}
        ></integration-category-tabs>
      </nav>

      <main class="integrations-grid" @card-click=${this.handleCardClick}>
        ${filtered.length === 0
          ? html`<div class="integrations-loading" style="padding-top:40px">
              <span style="color:var(--text-dim);font-size:13px">${t('integ.noResults')}</span>
            </div>`
          : filtered.map((item) => this.renderCardItem(item))}
      </main>

      <aside class="config-panel ${this.openPanelId ? 'open' : ''}">
        <div class="config-panel-header">
          <h2 class="config-panel-title" data-i18n="integ.configure">${this.getPanelTitle()}</h2>
          <button
            class="config-panel-close"
            data-i18n-title="integ.close"
            title="Close"
            @click=${this.closePanel}
          >
            <img src="/icons/x.svg" alt="" />
          </button>
        </div>
        <div class="config-panel-body">
          ${this.openPanelId
            ? html`<integration-config-panel
                .panelId=${this.openPanelId}
                .item=${openItem}
                .accountLabel=${this.openPanelId
                  ? (this.accountLabels[this.openPanelId] ?? '')
                  : ''}
                @config-refresh=${this.handleConfigRefresh}
              ></integration-config-panel>`
            : nothing}
        </div>
      </aside>
    `;
  }

  private renderCardItem(item: {
    id: string;
    name: string;
    icon: string;
    description: string;
    category: string;
    connected: boolean;
    toolCount: number;
    toolLabel: string;
  }) {
    return html`
      <integration-card
        .integrationId=${item.id}
        .name=${item.name}
        .icon=${item.icon}
        .description=${item.description}
        .category=${this.formatCategory(item.category)}
        .connected=${item.connected}
        .toolCount=${item.toolCount}
        .toolLabel=${item.toolLabel}
      ></integration-card>
    `;
  }

  private getFilteredItems() {
    const query = this.searchQuery;
    const category = this.activeCategory;
    const items: Array<{
      id: string;
      name: string;
      icon: string;
      description: string;
      category: string;
      connected: boolean;
      toolCount: number;
      toolLabel: string;
    }> = [];

    const isTgConnected = this.telegramBots.some((b) => b.connected);
    const tgBotCount = this.telegramBots.filter((b) => b.connected).length;

    if (this.matchesFilter(TELEGRAM_CARD.name, TELEGRAM_CARD.category, query, category)) {
      items.push({
        id: TELEGRAM_CARD.id,
        name: TELEGRAM_CARD.name,
        icon: TELEGRAM_CARD.icon,
        description: TELEGRAM_CARD.description,
        category: TELEGRAM_CARD.category,
        connected: isTgConnected,
        toolCount: tgBotCount,
        toolLabel: tgBotCount === 1 ? t('integ.bot') : t('integ.bots'),
      });
    }

    for (const item of this.catalog) {
      if (!this.matchesFilter(item.definition.name, item.definition.category, query, category))
        continue;
      items.push({
        id: item.id,
        name: item.definition.name,
        icon: item.definition.icon,
        description: item.definition.description,
        category: item.definition.category,
        connected: item.connected,
        toolCount: item.connected ? item.tools.length : 0,
        toolLabel: t('integ.tools'),
      });
    }

    return items;
  }

  private matchesFilter(
    name: string,
    category: string,
    query: string,
    activeCategory: string,
  ): boolean {
    const matchesCategory = activeCategory === 'all' || category === activeCategory;
    const matchesSearch =
      !query || name.toLowerCase().includes(query) || category.toLowerCase().includes(query);
    return matchesCategory && matchesSearch;
  }

  private getPresentCategories(): Set<string> {
    const categories = new Set<string>();
    categories.add(TELEGRAM_CARD.category);
    for (const item of this.catalog) {
      categories.add(item.definition.category);
    }
    return categories;
  }

  private getPanelTitle(): string {
    if (this.openPanelId === 'telegram') return 'Telegram';
    const item = this.catalog.find((c) => c.id === this.openPanelId);
    return item?.definition.name ?? t('integ.configure');
  }

  private formatCategory(category: string): string {
    const tab = CATEGORY_ORDER.find((c) => c.id === category);
    if (tab) return t(tab.labelKey);
    return category
      .replaceAll('_', ' ')
      .split(' ')
      .map((w) => {
        const lower = w.toLowerCase();
        return ACRONYMS[lower] ?? lower.charAt(0).toUpperCase() + lower.slice(1);
      })
      .join(' ');
  }

  private handleSearch(e: Event) {
    this.searchQuery = (e.target as HTMLInputElement).value.toLowerCase().trim();
  }

  private handleCategoryChange(e: CustomEvent<{ category: string }>) {
    this.activeCategory = e.detail.category;
  }

  private handleCardClick(e: CustomEvent<{ id: string }>) {
    this.openPanelId = e.detail.id;
  }

  private closePanel() {
    this.openPanelId = null;
  }

  private async handleConfigRefresh() {
    await this.refreshCatalog();
    const tgStatus = await getTelegramStatus().catch(() => ({ bots: [] as TelegramBot[] }));
    this.telegramBots = tgStatus.bots ?? [];
    if (this.openPanelId && this.openPanelId !== 'telegram') {
      const updated = this.catalog.find((c) => c.id === this.openPanelId);
      if (!updated?.connected) this.openPanelId = null;
    }
  }

  private async refreshCatalog() {
    this.catalog = await invokeWithRetry<IntegrationStatus[]>('integrations_list_catalog').catch(
      () => [],
    );
    const labels = await getIntegrationAccounts().catch(() => ({}));
    this.accountLabels = labels;
  }
}
