import { html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { LightDomElement } from '../shared/light-dom-element.js';
import { adoptGlobalStyles, adoptStyles } from '../shared/styles/inject.js';
import { integrationStyles } from './styles.js';
import type {
  IntegrationStatus,
  TelegramBot,
  ChannelBot,
  PersonalMcpEntry,
} from '../shared/types.js';
import {
  invokeWithRetry,
  getTelegramStatus,
  getSlackStatus,
  getDiscordStatus,
  getWhatsappStatus,
  getEmailStatus,
  getIntegrationAccounts,
  navigateBack,
  personalMcpList,
  personalMcpConnect,
  personalMcpDisconnect,
} from '../shared/ipc.js';
import { ACRONYMS } from '../shared/utils.js';
import { searchIcon } from '../shared/icons.js';
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

const SLACK_CARD = {
  id: 'slack',
  name: 'Slack',
  description: 'Workspace messaging for agent communication',
  icon: 'slack',
  category: 'communication',
} as const;

const DISCORD_CARD = {
  id: 'discord',
  name: 'Discord',
  description: 'Server messaging for agent communication',
  icon: 'discord',
  category: 'communication',
} as const;

const WHATSAPP_CARD = {
  id: 'whatsapp',
  name: 'WhatsApp',
  description: 'Business messaging for agent communication',
  icon: 'whatsapp',
  category: 'communication',
} as const;

const EMAIL_CARD = {
  id: 'email',
  name: 'Email',
  description: 'IMAP/SMTP email for agent communication',
  icon: 'gmail',
  category: 'communication',
} as const;

const CHANNEL_CARDS = [TELEGRAM_CARD, SLACK_CARD, DISCORD_CARD, WHATSAPP_CARD, EMAIL_CARD] as const;

@customElement('sauria-integrations')
export class SauriaIntegrations extends LightDomElement {
  @state() private catalog: IntegrationStatus[] = [];
  @state() private telegramBots: readonly TelegramBot[] = [];
  @state() private slackBots: readonly ChannelBot[] = [];
  @state() private discordBots: readonly ChannelBot[] = [];
  @state() private whatsappBots: readonly ChannelBot[] = [];
  @state() private emailBots: readonly ChannelBot[] = [];
  @state() private accountLabels: Record<string, string> = {};
  @state() private searchQuery = '';
  @state() private activeCategory = 'all';
  @state() private activeTab: 'native' | 'personal' = 'native';
  @state() private personalEntries: PersonalMcpEntry[] = [];
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

    const emptyBots = { bots: [] as ChannelBot[] };
    const [mcpCatalog, tgStatus, slStatus, dcStatus, waStatus, emStatus, labels, personal] =
      await Promise.all([
        invokeWithRetry<IntegrationStatus[]>('integrations_list_catalog').catch(
          () => [] as IntegrationStatus[],
        ),
        invokeWithRetry<{ bots: TelegramBot[] }>('get_telegram_status').catch(() => ({
          bots: [] as TelegramBot[],
        })),
        invokeWithRetry<{ bots: ChannelBot[] }>('get_slack_status').catch(() => ({ ...emptyBots })),
        invokeWithRetry<{ bots: ChannelBot[] }>('get_discord_status').catch(() => ({
          ...emptyBots,
        })),
        invokeWithRetry<{ bots: ChannelBot[] }>('get_whatsapp_status').catch(() => ({
          ...emptyBots,
        })),
        invokeWithRetry<{ bots: ChannelBot[] }>('get_email_status').catch(() => ({
          ...emptyBots,
        })),
        invokeWithRetry<Record<string, string>>('get_integration_accounts').catch(
          () => ({}) as Record<string, string>,
        ),
        personalMcpList().catch(() => [] as PersonalMcpEntry[]),
      ]);

    this.catalog = mcpCatalog;
    this.telegramBots = tgStatus.bots ?? [];
    this.slackBots = slStatus.bots ?? [];
    this.discordBots = dcStatus.bots ?? [];
    this.whatsappBots = waStatus.bots ?? [];
    this.emailBots = emStatus.bots ?? [];
    this.accountLabels = labels;
    this.personalEntries = personal;
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

        this.requestUpdate();
      },
    );
  }

  override render() {
    if (!this.ready) {
      return html` <div class="integrations-loading"><div class="spinner"></div></div> `;
    }

    const isNative = this.activeTab === 'native';
    const filtered = isNative ? this.getFilteredItems() : [];
    const presentCategories = this.getPresentCategories();
    const visibleTabs = CATEGORY_ORDER.filter(
      (cat) => cat.id === 'all' || presentCategories.has(cat.id),
    );
    const channelPanels = new Set(['telegram', 'slack', 'discord', 'whatsapp', 'email']);
    const openItem =
      this.openPanelId && !channelPanels.has(this.openPanelId)
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
          ${searchIcon()}
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

      <div class="integrations-toggle">
        <div class="segmented-toggle">
          <div
            class="segmented-highlight"
            style="left: ${this.activeTab === 'personal' ? 'calc(50% + 1px)' : '2px'}"
          ></div>
          <button
            class="seg-btn ${isNative ? 'active' : ''}"
            @click=${() => (this.activeTab = 'native')}
          >
            ${t('integ.nativeTab')}
          </button>
          <button
            class="seg-btn ${!isNative ? 'active' : ''}"
            @click=${() => (this.activeTab = 'personal')}
          >
            ${t('integ.personalTab')}
          </button>
        </div>
      </div>

      ${isNative
        ? html`
            <nav class="category-tabs">
              <integration-category-tabs
                .tabs=${visibleTabs}
                .activeCategory=${this.activeCategory}
                @category-change=${this.handleCategoryChange}
              ></integration-category-tabs>
            </nav>

            <main class="integrations-grid" @card-click=${this.handleCardClick}>
              ${filtered.length === 0
                ? html`<div class="integrations-empty">
                    <span class="integrations-empty-text">${t('integ.noResults')}</span>
                  </div>`
                : filtered.map((item) => this.renderCardItem(item))}
            </main>
          `
        : html`
            <main
              class="integrations-grid integrations-grid--personal"
              @card-click=${this.handleCardClick}
            >
              <button class="ch-add-card ch-add-card--grid" @click=${this.handleAddPersonalMcp}>
                <img
                  src="/icons/plus.svg"
                  alt=""
                  style="width:var(--spacing-mld);height:var(--spacing-mld);filter:brightness(0) invert();opacity:var(--opacity-muted)"
                />
                <span>${t('integ.addMcpServer')}</span>
              </button>
              ${this.personalEntries.length === 0
                ? html`<div class="integrations-empty">
                    <span class="integrations-empty-text">${t('integ.personalEmpty')}</span>
                  </div>`
                : this.personalEntries.map((entry) => this.renderPersonalCard(entry))}
            </main>
          `}

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
                .personalEntries=${this.personalEntries}
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

  private getChannelBots(platform: string): readonly (TelegramBot | ChannelBot)[] {
    switch (platform) {
      case 'telegram':
        return this.telegramBots;
      case 'slack':
        return this.slackBots;
      case 'discord':
        return this.discordBots;
      case 'whatsapp':
        return this.whatsappBots;
      case 'email':
        return this.emailBots;
      default:
        return [];
    }
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

    for (const card of CHANNEL_CARDS) {
      const bots = this.getChannelBots(card.id);
      const connectedBots = bots.filter((b) => b.connected);
      if (this.matchesFilter(card.name, card.category, query, category)) {
        items.push({
          id: card.id,
          name: card.name,
          icon: card.icon,
          description: card.description,
          category: card.category,
          connected: connectedBots.length > 0,
          toolCount: connectedBots.length,
          toolLabel: connectedBots.length === 1 ? t('integ.bot') : t('integ.bots'),
        });
      }
    }

    const channelCatalogIds = new Set(['slack-tools']);

    for (const item of this.catalog) {
      if (channelCatalogIds.has(item.id)) continue;
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
    for (const card of CHANNEL_CARDS) {
      categories.add(card.category);
    }
    for (const item of this.catalog) {
      categories.add(item.definition.category);
    }
    return categories;
  }

  private getPanelTitle(): string {
    const channelCard = CHANNEL_CARDS.find((c) => c.id === this.openPanelId);
    if (channelCard) return channelCard.name;
    if (this.openPanelId === 'personal-mcp-add') return t('integ.addMcpServer');
    if (this.openPanelId?.startsWith('personal-mcp-edit:')) {
      const entryId = this.openPanelId.slice('personal-mcp-edit:'.length);
      const entry = this.personalEntries.find((e) => e.id === entryId);
      return entry?.name ?? t('integ.editMcpServer');
    }
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

  private renderPersonalCard(entry: PersonalMcpEntry) {
    const description =
      entry.transport === 'stdio' ? `${entry.command} ${entry.args.join(' ')}` : entry.url;

    return html`
      <div
        class="card card-vertical connected personal-mcp-card"
        @click=${() => {
          this.openPanelId = `personal-mcp-edit:${entry.id}`;
        }}
        style="cursor:pointer"
      >
        <div class="card-header">
          <img
            class="card-icon-img"
            src="/icons/integrations/mcp.svg"
            alt=""
            @error=${(e: Event) => {
              (e.target as HTMLImageElement).src = '/icons/blocks.svg';
            }}
          />
          <span class="card-name">${entry.name}</span>
        </div>
        <div
          class="card-description"
          style="font-family:var(--font-family-mono);font-size:var(--font-size-micro);opacity:var(--opacity-subtle)"
        >
          ${description}
        </div>
        <div class="card-footer">
          <span class="badge badge-success">${t('integ.connected')}</span>
          <span class="badge badge-accent"
            >${entry.transport === 'stdio'
              ? t('integ.mcpTransportStdio')
              : t('integ.mcpTransportRemote')}</span
          >
          ${entry.toolCount != null
            ? html`<span class="badge badge-dim">${entry.toolCount} ${t('integ.tools')}</span>`
            : nothing}
          <button
            class="personal-mcp-disconnect"
            title="${t('integ.disconnect')}"
            @click=${(e: Event) => {
              e.stopPropagation();
              this.handleDisconnectPersonalMcp(entry.id);
            }}
          >
            <img
              src="/icons/x.svg"
              alt=""
              style="width:var(--spacing-md);height:var(--spacing-md);filter:brightness(0) invert();opacity:var(--opacity-muted)"
            />
          </button>
        </div>
      </div>
    `;
  }

  private handleAddPersonalMcp() {
    this.openPanelId = 'personal-mcp-add';
  }

  private async handleDisconnectPersonalMcp(id: string) {
    await personalMcpDisconnect(id);
    this.personalEntries = this.personalEntries.filter((e) => e.id !== id);
  }

  private handleCardClick(e: CustomEvent<{ id: string }>) {
    this.openPanelId = e.detail.id;
  }

  private closePanel() {
    this.openPanelId = null;
  }

  private async handleConfigRefresh() {
    await this.refreshCatalog();
    const channelPanels = new Set(['telegram', 'slack', 'discord', 'whatsapp', 'email']);
    const emptyBots = { bots: [] as ChannelBot[] };
    const [tgStatus, slStatus, dcStatus, waStatus, emStatus, personal] = await Promise.all([
      getTelegramStatus().catch(() => ({ bots: [] as TelegramBot[] })),
      getSlackStatus().catch(() => ({ ...emptyBots })),
      getDiscordStatus().catch(() => ({ ...emptyBots })),
      getWhatsappStatus().catch(() => ({ ...emptyBots })),
      getEmailStatus().catch(() => ({ ...emptyBots })),
      personalMcpList().catch(() => [] as PersonalMcpEntry[]),
    ]);
    this.telegramBots = tgStatus.bots ?? [];
    this.slackBots = slStatus.bots ?? [];
    this.discordBots = dcStatus.bots ?? [];
    this.whatsappBots = waStatus.bots ?? [];
    this.emailBots = emStatus.bots ?? [];
    this.personalEntries = personal;
    if (this.openPanelId && !channelPanels.has(this.openPanelId)) {
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
