import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { t, applyTranslations } from '../i18n.js';

// ── Types ─────────────────────────────────────

interface McpRemoteServer {
  readonly url: string;
  readonly authorizationUrl?: string;
  readonly tokenUrl?: string;
}

interface IntegrationDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly icon: string;
  readonly category: string;
  readonly authType: 'api_key' | 'oauth' | 'token';
  readonly credentialKeys: readonly string[];
  readonly mcpRemote?: McpRemoteServer;
  readonly oauthProxy?: string;
}

interface IntegrationTool {
  readonly name: string;
  readonly description?: string;
}

interface IntegrationStatus {
  readonly id: string;
  readonly definition: IntegrationDefinition;
  readonly connected: boolean;
  readonly tools: readonly IntegrationTool[];
  readonly error?: string;
}

interface TelegramBot {
  readonly nodeId?: string;
  readonly label?: string;
  readonly connected: boolean;
  readonly photo?: string;
  readonly profile?: { readonly username: string; readonly photo?: string };
}

interface TelegramStatus {
  readonly bots: readonly TelegramBot[];
}

interface ConnectResult {
  readonly success: boolean;
  readonly botUsername?: string;
  readonly error?: string;
}

// ── Category Config ──────────────────────────

const CATEGORY_ORDER: readonly { readonly id: string; readonly labelKey: string }[] = [
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
];

// ── State ─────────────────────────────────────

let catalog: IntegrationStatus[] = [];
let telegramBots: readonly TelegramBot[] = [];
let searchQuery = '';
let activeCategory = 'all';
let openPanelId: string | null = null;

// ── DOM refs ──────────────────────────────────

const grid = document.getElementById('integrations-grid') as HTMLElement;
const searchInput = document.getElementById('search-input') as HTMLInputElement;
const configPanel = document.getElementById('config-panel') as HTMLElement;
const configTitle = document.getElementById('config-title') as HTMLElement;
const configBody = document.getElementById('config-body') as HTMLElement;
const configClose = document.getElementById('config-close') as HTMLButtonElement;
const categoryTabs = document.getElementById('category-tabs') as HTMLElement;

// ── Telegram card (frontend-only, not an MCP integration) ─────

const TELEGRAM_CARD = {
  id: 'telegram',
  name: 'Telegram',
  description: 'Messaging channel for agent communication',
  icon: 'telegram',
  category: 'communication',
} as const;

function isTelegramConnected(): boolean {
  return telegramBots.some((b) => b.connected);
}

function telegramBotCount(): number {
  return telegramBots.filter((b) => b.connected).length;
}

// ── Render ────────────────────────────────────

function renderTabs(): void {
  const presentCategories = new Set<string>();
  presentCategories.add(TELEGRAM_CARD.category);
  for (const item of catalog) {
    presentCategories.add(item.definition.category);
  }

  const tabs = CATEGORY_ORDER.filter(
    (cat) => cat.id === 'all' || presentCategories.has(cat.id),
  );

  categoryTabs.innerHTML = tabs
    .map(
      (cat) =>
        `<button class="category-tab ${cat.id === activeCategory ? 'active' : ''}" data-category="${cat.id}">${t(cat.labelKey)}</button>`,
    )
    .join('');

  categoryTabs.querySelectorAll('.category-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeCategory = (btn as HTMLElement).dataset['category'] ?? 'all';
      renderTabs();
      renderGrid();
    });
  });
}

function renderCard(
  id: string,
  name: string,
  icon: string,
  description: string,
  category: string,
  isConnected: boolean,
  toolCount: number,
): string {
  return `
    <div class="integration-card ${isConnected ? 'connected' : ''}" data-id="${id}">
      <div class="integration-card-header">
        <img
          class="integration-card-icon"
          src="/icons/integrations/${icon}.svg"
          alt=""
          onerror="this.style.display='none'"
        />
        <span class="integration-card-name">${name}</span>
      </div>
      <div class="integration-card-description">${description}</div>
      <div class="integration-card-footer">
        ${
          isConnected
            ? `<span class="badge badge-success">${t('integ.connected')}</span>`
            : `<span class="badge badge-error">${t('integ.disconnected')}</span>`
        }
        ${toolCount > 0 ? `<span class="badge badge-accent">${toolCount} ${id === 'telegram' ? (toolCount === 1 ? t('integ.bot') : t('integ.bots')) : t('integ.tools')}</span>` : ''}
      </div>
      <span class="integration-card-category">${formatCategory(category)}</span>
    </div>`;
}

function renderGrid(): void {
  const matchesFilter = (name: string, category: string): boolean => {
    const matchesCategory = activeCategory === 'all' || category === activeCategory;
    const matchesSearch_ =
      !searchQuery ||
      name.toLowerCase().includes(searchQuery) ||
      category.toLowerCase().includes(searchQuery);
    return matchesCategory && matchesSearch_;
  };

  const cards: string[] = [];

  // Telegram card
  if (matchesFilter(TELEGRAM_CARD.name, TELEGRAM_CARD.category)) {
    cards.push(
      renderCard(
        TELEGRAM_CARD.id,
        TELEGRAM_CARD.name,
        TELEGRAM_CARD.icon,
        TELEGRAM_CARD.description,
        TELEGRAM_CARD.category,
        isTelegramConnected(),
        telegramBotCount(),
      ),
    );
  }

  // MCP integration cards
  for (const item of catalog) {
    if (!matchesFilter(item.definition.name, item.definition.category)) continue;
    cards.push(
      renderCard(
        item.id,
        item.definition.name,
        item.definition.icon,
        item.definition.description,
        item.definition.category,
        item.connected,
        item.connected ? item.tools.length : 0,
      ),
    );
  }

  if (cards.length === 0) {
    grid.innerHTML = `<div class="integrations-loading" style="padding-top:40px">
      <span style="color:var(--text-dim);font-size:13px">${t('integ.noResults')}</span>
    </div>`;
    return;
  }

  grid.innerHTML = cards.join('');

  grid.querySelectorAll('.integration-card').forEach((card) => {
    card.addEventListener('click', () => {
      const id = (card as HTMLElement).dataset['id'];
      if (id) openConfigPanel(id);
    });
  });
}

// ── Config Panel ─────────────────────────────

function openConfigPanel(id: string): void {
  openPanelId = id;
  if (id === 'telegram') {
    configTitle.textContent = 'Telegram';
    renderTelegramPanel();
  } else {
    const item = catalog.find((c) => c.id === id);
    if (!item) return;
    configTitle.textContent = item.definition.name;
    if (item.connected) {
      renderConnectedPanel(item);
    } else {
      renderConnectForm(item);
    }
  }
  configPanel.classList.add('open');
}

// ── Telegram Panel ───────────────────────────

async function renderTelegramPanel(): Promise<void> {
  const status = await invoke<TelegramStatus>('get_telegram_status');
  telegramBots = status.bots ?? [];
  const connected = telegramBots.filter((b) => b.connected);

  const botCards = connected
    .map((bot) => {
      const name = bot.label || (bot.profile ? `@${bot.profile.username}` : 'Telegram Bot');
      const photo = bot.photo || bot.profile?.photo;
      const avatarHtml = photo
        ? `<img class="tg-bot-avatar" src="${photo}" alt="" />`
        : `<div class="tg-bot-avatar-placeholder"><img src="/icons/integrations/telegram.svg" alt="" /></div>`;

      return `
        <div class="tg-bot-card">
          ${avatarHtml}
          <div class="tg-bot-info">
            <div class="tg-bot-name">${name}</div>
            <div class="tg-bot-status"><span class="tg-bot-dot"></span>${t('integ.online')}</div>
          </div>
          <button class="tg-bot-disconnect" data-node-id="${bot.nodeId ?? ''}" title="${t('integ.disconnect')}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>`;
    })
    .join('');

  configBody.innerHTML = `
    ${botCards ? `<div class="tg-bot-list">${botCards}</div>` : ''}
    <div class="tg-connect-section" id="tg-connect-section" style="${connected.length > 0 ? 'display:none' : ''}">
      <div class="config-field">
        <label class="config-label">${t('integ.telegramUserId')}</label>
        <input class="config-input" type="text" id="tg-userid" placeholder="${t('integ.userIdHint')}" autocomplete="off" />
      </div>
      <div class="config-field">
        <label class="config-label">${t('integ.botToken')}</label>
        <input class="config-input" type="password" id="tg-token" placeholder="${t('integ.tokenHint')}" autocomplete="off" />
      </div>
      <div class="form-status" id="tg-status"></div>
      <div class="config-actions">
        <button class="btn btn-primary" id="tg-submit" disabled>${t('integ.connectBot')}</button>
      </div>
    </div>
    ${connected.length > 0 ? `<button class="tg-add-card" id="tg-add-btn"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg><span>${t('integ.addBot')}</span></button>` : ''}
  `;

  // Wire disconnect buttons
  configBody.querySelectorAll('.tg-bot-disconnect').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const nodeId = (btn as HTMLElement).dataset['nodeId'];
      if (nodeId) {
        await invoke('disconnect_channel', { platform: 'telegram', nodeId });
        await renderTelegramPanel();
        await refreshTelegramStatus();
        renderGrid();
      }
    });
  });

  // Wire add button
  document.getElementById('tg-add-btn')?.addEventListener('click', () => {
    const section = document.getElementById('tg-connect-section') as HTMLElement;
    section.style.display = '';
    (document.getElementById('tg-add-btn') as HTMLElement).style.display = 'none';
    (document.getElementById('tg-userid') as HTMLInputElement).focus();
  });

  // Wire connect form
  const tokenInput = document.getElementById('tg-token') as HTMLInputElement | null;
  const userIdInput = document.getElementById('tg-userid') as HTMLInputElement | null;
  const submitBtn = document.getElementById('tg-submit') as HTMLButtonElement | null;
  const statusEl = document.getElementById('tg-status') as HTMLElement | null;

  if (tokenInput && userIdInput && submitBtn && statusEl) {
    const validate = (): void => {
      submitBtn.disabled = !(tokenInput.value.trim() && userIdInput.value.trim());
    };
    tokenInput.addEventListener('input', validate);
    userIdInput.addEventListener('input', validate);

    submitBtn.addEventListener('click', async () => {
      const rawId = userIdInput.value.trim().replace(/\D/g, '');
      const parsedId = parseInt(rawId, 10);
      if (!rawId || isNaN(parsedId) || parsedId <= 0) {
        statusEl.textContent = t('integ.userIdError');
        statusEl.className = 'form-status visible error';
        userIdInput.focus();
        return;
      }

      submitBtn.disabled = true;
      statusEl.textContent = t('integ.connecting');
      statusEl.className = 'form-status visible';

      try {
        const result = await invoke<ConnectResult>('connect_channel', {
          platform: 'telegram',
          credentials: { token: tokenInput.value.trim(), userId: parsedId },
        });
        if (result.success) {
          statusEl.textContent = `${t('integ.connectedTo')} @${result.botUsername}`;
          statusEl.className = 'form-status visible success';
          setTimeout(async () => {
            await renderTelegramPanel();
            await refreshTelegramStatus();
            renderGrid();
          }, 800);
        } else {
          statusEl.textContent = result.error ?? t('integ.connectionFailed');
          statusEl.className = 'form-status visible error';
          submitBtn.disabled = false;
        }
      } catch {
        statusEl.textContent = t('integ.connectionFailed');
        statusEl.className = 'form-status visible error';
        submitBtn.disabled = false;
      }
    });
  }
}

// ── MCP Integration Panels ───────────────────

function renderConnectForm(item: IntegrationStatus): void {
  const { definition } = item;

  // OAuth one-click: any service with authType 'oauth' gets the OAuth button
  if (definition.authType === 'oauth') {
    renderOAuthConnectForm(item);
    return;
  }

  const fields = definition.credentialKeys
    .map(
      (key) => `
    <div class="config-field">
      <label class="config-label">${formatLabel(key)}</label>
      <input
        class="config-input"
        type="password"
        data-key="${key}"
        placeholder="${t('integ.enter')} ${formatLabel(key)}"
        autocomplete="off"
      />
    </div>
  `,
    )
    .join('');

  configBody.innerHTML = `
    ${item.error ? `<div class="config-error">${item.error}</div>` : ''}
    ${fields}
    <div class="config-actions">
      <button class="btn btn-primary" id="config-connect">${t('integ.connect')}</button>
    </div>
  `;

  document.getElementById('config-connect')?.addEventListener('click', () => handleConnect(item));
}

function renderOAuthConnectForm(item: IntegrationStatus): void {
  const { definition } = item;

  configBody.innerHTML = `
    ${item.error ? `<div class="config-error">${item.error}</div>` : ''}
    <div class="oauth-connect-section">
      <p class="oauth-description">${t('integ.oauthDescription').replace('{name}', definition.name)}</p>
      <div class="config-actions">
        <button class="btn btn-primary" id="oauth-connect-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
          ${t('integ.connectWith').replace('{name}', definition.name)}
        </button>
      </div>
      <div class="form-status" id="oauth-status"></div>
    </div>
  `;

  document.getElementById('oauth-connect-btn')?.addEventListener('click', () => handleOAuthConnect(item));
}

function renderConnectedPanel(item: IntegrationStatus): void {
  const toolsList = item.tools
    .slice(0, 15)
    .map((tool) => `<div class="config-tool-item">${tool.name}</div>`)
    .join('');

  configBody.innerHTML = `
    <div class="config-tools">
      <div class="config-tools-title">${t('integ.availableTools')} (${item.tools.length})</div>
      ${toolsList}
      ${item.tools.length > 15 ? `<div class="config-tool-item" style="color:var(--text-dim)">+${item.tools.length - 15} ${t('integ.more')}</div>` : ''}
    </div>
    <div class="config-actions">
      <button class="btn btn-secondary" id="config-disconnect">${t('integ.disconnect')}</button>
    </div>
  `;

  document
    .getElementById('config-disconnect')
    ?.addEventListener('click', () => handleDisconnect(item.id));
}

// ── Actions ───────────────────────────────────

async function handleConnect(item: IntegrationStatus): Promise<void> {
  const credentials: Record<string, string> = {};
  const inputs = Array.from(configBody.querySelectorAll<HTMLInputElement>('.config-input'));
  for (const input of inputs) {
    const key = input.dataset['key'];
    if (!key || !input.value.trim()) {
      input.style.borderColor = 'var(--error)';
      return;
    }
    credentials[key] = input.value.trim();
  }

  const btn = document.getElementById('config-connect') as HTMLButtonElement;
  btn.disabled = true;
  btn.textContent = t('integ.connecting');

  try {
    await invoke('integrations_connect', { id: item.id, credentials });
    await refreshCatalog();
    const updated = catalog.find((c) => c.id === item.id);
    if (updated?.connected) {
      renderConnectedPanel(updated);
    } else if (updated) {
      renderConnectForm(updated);
    }
  } catch (err: unknown) {
    btn.disabled = false;
    btn.textContent = t('integ.connect');
    const errorDiv = document.createElement('div');
    errorDiv.className = 'config-error';
    errorDiv.textContent = err instanceof Error ? err.message : String(err);
    configBody.prepend(errorDiv);
  }
}

async function handleOAuthConnect(item: IntegrationStatus): Promise<void> {
  const { mcpRemote, oauthProxy } = item.definition;
  if (!mcpRemote && !oauthProxy) return;

  const btn = document.getElementById('oauth-connect-btn') as HTMLButtonElement;
  const statusEl = document.getElementById('oauth-status') as HTMLElement;

  btn.disabled = true;
  statusEl.textContent = t('integ.oauthWaiting');
  statusEl.className = 'form-status visible';

  try {
    if (mcpRemote) {
      // Remote MCP: discover OAuth metadata from MCP server
      await invoke('start_integration_oauth', {
        integrationId: item.id,
        mcpUrl: mcpRemote.url,
        authUrl: mcpRemote.authorizationUrl ?? null,
        tokenUrl: mcpRemote.tokenUrl ?? null,
        scopes: null,
      });
    } else {
      // Worker proxy: redirect via auth.sauria.app/connect/:provider
      const proxyBase = await invoke<string>('get_auth_proxy_url');
      await invoke('start_integration_oauth', {
        integrationId: item.id,
        mcpUrl: proxyBase,
        authUrl: `${proxyBase}/connect/${oauthProxy}`,
        tokenUrl: null,
        scopes: null,
      });
    }
  } catch (err: unknown) {
    btn.disabled = false;
    statusEl.textContent = err instanceof Error ? err.message : String(err);
    statusEl.className = 'form-status visible error';
  }
}

async function handleDisconnect(id: string): Promise<void> {
  const btn = document.getElementById('config-disconnect') as HTMLButtonElement;
  btn.disabled = true;
  btn.textContent = t('integ.disconnecting');

  try {
    await invoke('integrations_disconnect', { id });
    await refreshCatalog();
    configPanel.classList.remove('open');
  } catch {
    btn.disabled = false;
    btn.textContent = t('integ.disconnect');
  }
}

async function refreshCatalog(): Promise<void> {
  catalog = (await invoke('integrations_list_catalog')) as IntegrationStatus[];
  renderGrid();
}

async function refreshTelegramStatus(): Promise<void> {
  try {
    const status = await invoke<TelegramStatus>('get_telegram_status');
    telegramBots = status.bots ?? [];
  } catch {
    telegramBots = [];
  }
}

// ── Helpers ───────────────────────────────────

const ACRONYMS: Record<string, string> = {
  api: 'API',
  url: 'URL',
  uri: 'URI',
  id: 'ID',
  sid: 'SID',
  imap: 'IMAP',
  smtp: 'SMTP',
  oauth: 'OAuth',
  ssh: 'SSH',
  http: 'HTTP',
  https: 'HTTPS',
  sql: 'SQL',
  crm: 'CRM',
  cdn: 'CDN',
  dns: 'DNS',
  ip: 'IP',
};

function formatCategory(category: string): string {
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

function formatLabel(key: string): string {
  const words = key
    .replace(/([A-Z])/g, ' $1')
    .trim()
    .split(/\s+/);
  return words
    .map((w) => {
      const lower = w.toLowerCase();
      return ACRONYMS[lower] ?? lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

// ── Init ──────────────────────────────────────

searchInput.addEventListener('input', () => {
  searchQuery = searchInput.value.toLowerCase().trim();
  renderGrid();
});

configClose.addEventListener('click', () => {
  openPanelId = null;
  configPanel.classList.remove('open');
});

// Palette setup
document.body.classList.add('in-palette');
document.documentElement.style.background = 'transparent';

(document.getElementById('palette-back') as HTMLButtonElement).addEventListener('click', () => {
  invoke('navigate_back');
});

applyTranslations();

// Retry-aware invoke: if first attempt fails (stale connection), retry once
async function invokeWithRetry<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(cmd, args);
  } catch {
    // First failure clears stale connection; second attempt reconnects
    return invoke<T>(cmd, args);
  }
}

// Listen for OAuth completion from deep link callback
void listen('integration-oauth-complete', async () => {
  await refreshCatalog();
  const statusEl = document.getElementById('oauth-status');
  if (statusEl) {
    statusEl.textContent = t('integ.oauthSuccess');
    statusEl.className = 'form-status visible success';
  }
  setTimeout(() => {
    if (openPanelId) {
      const updated = catalog.find((c) => c.id === openPanelId);
      if (updated?.connected) renderConnectedPanel(updated);
    }
  }, 800);
});

// Load both catalogs in parallel
Promise.all([
  invokeWithRetry<IntegrationStatus[]>('integrations_list_catalog').catch(() => []),
  invokeWithRetry<TelegramStatus>('get_telegram_status').catch(() => ({ bots: [] as TelegramBot[] })),
]).then(([mcpCatalog, tgStatus]) => {
  catalog = mcpCatalog;
  telegramBots = tgStatus.bots ?? [];
  renderTabs();
  renderGrid();
});
