import { invoke } from '@tauri-apps/api/core';

// ── Types ─────────────────────────────────────

interface IntegrationDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly icon: string;
  readonly category: string;
  readonly authType: 'api_key' | 'oauth' | 'token';
  readonly credentialKeys: readonly string[];
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

const CATEGORY_ORDER: readonly { readonly id: string; readonly label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'communication', label: 'Communication' },
  { id: 'project_management', label: 'Project Mgmt' },
  { id: 'development', label: 'Development' },
  { id: 'productivity', label: 'Productivity' },
  { id: 'infrastructure', label: 'Infrastructure' },
  { id: 'monitoring', label: 'Monitoring' },
  { id: 'ecommerce', label: 'E-commerce' },
  { id: 'design', label: 'Design' },
  { id: 'data', label: 'Data' },
  { id: 'crm', label: 'CRM' },
  { id: 'automation', label: 'Automation' },
  { id: 'content', label: 'Content' },
  { id: 'storage', label: 'Storage' },
];

// ── State ─────────────────────────────────────

let catalog: IntegrationStatus[] = [];
let telegramBots: readonly TelegramBot[] = [];
let searchQuery = '';
let activeCategory = 'all';

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
        `<button class="category-tab ${cat.id === activeCategory ? 'active' : ''}" data-category="${cat.id}">${cat.label}</button>`,
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
            ? `<span class="badge badge-success">Connected</span>`
            : `<span class="badge badge-error">Disconnected</span>`
        }
        ${toolCount > 0 ? `<span class="badge badge-accent">${toolCount} ${id === 'telegram' ? (toolCount === 1 ? 'bot' : 'bots') : 'tools'}</span>` : ''}
      </div>
      <span class="integration-card-category">${category.replaceAll('_', ' ')}</span>
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
      <span style="color:var(--text-dim);font-size:13px">No integrations found</span>
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
            <div class="tg-bot-status"><span class="tg-bot-dot"></span>Online</div>
          </div>
          <button class="tg-bot-disconnect" data-node-id="${bot.nodeId ?? ''}" title="Disconnect">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>`;
    })
    .join('');

  configBody.innerHTML = `
    ${botCards ? `<div class="tg-bot-list">${botCards}</div>` : ''}
    <div class="tg-connect-section" id="tg-connect-section" style="${connected.length > 0 ? 'display:none' : ''}">
      <div class="config-field">
        <label class="config-label">Telegram User ID</label>
        <input class="config-input" type="text" id="tg-userid" placeholder="Get from @userinfobot" autocomplete="off" />
      </div>
      <div class="config-field">
        <label class="config-label">Bot Token</label>
        <input class="config-input" type="password" id="tg-token" placeholder="From @BotFather" autocomplete="off" />
      </div>
      <div class="form-status" id="tg-status"></div>
      <div class="config-actions">
        <button class="btn btn-primary" id="tg-submit" disabled>Connect Bot</button>
      </div>
    </div>
    ${connected.length > 0 ? `<button class="tg-add-card" id="tg-add-btn"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg><span>Add Bot</span></button>` : ''}
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
        statusEl.textContent = 'User ID must be a number (get it from @userinfobot)';
        statusEl.className = 'form-status visible error';
        userIdInput.focus();
        return;
      }

      submitBtn.disabled = true;
      statusEl.textContent = 'Connecting...';
      statusEl.className = 'form-status visible';

      try {
        const result = await invoke<ConnectResult>('connect_channel', {
          platform: 'telegram',
          credentials: { token: tokenInput.value.trim(), userId: parsedId },
        });
        if (result.success) {
          statusEl.textContent = `Connected to @${result.botUsername}`;
          statusEl.className = 'form-status visible success';
          setTimeout(async () => {
            await renderTelegramPanel();
            await refreshTelegramStatus();
            renderGrid();
          }, 800);
        } else {
          statusEl.textContent = result.error ?? 'Connection failed';
          statusEl.className = 'form-status visible error';
          submitBtn.disabled = false;
        }
      } catch {
        statusEl.textContent = 'Connection failed';
        statusEl.className = 'form-status visible error';
        submitBtn.disabled = false;
      }
    });
  }
}

// ── MCP Integration Panels ───────────────────

function renderConnectForm(item: IntegrationStatus): void {
  const { definition } = item;
  const fields = definition.credentialKeys
    .map(
      (key) => `
    <div class="config-field">
      <label class="config-label">${formatLabel(key)}</label>
      <input
        class="config-input"
        type="password"
        data-key="${key}"
        placeholder="Enter ${formatLabel(key).toLowerCase()}"
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
      <button class="btn btn-primary" id="config-connect">Connect</button>
    </div>
  `;

  document.getElementById('config-connect')?.addEventListener('click', () => handleConnect(item));
}

function renderConnectedPanel(item: IntegrationStatus): void {
  const toolsList = item.tools
    .slice(0, 15)
    .map((t) => `<div class="config-tool-item">${t.name}</div>`)
    .join('');

  configBody.innerHTML = `
    <div class="config-tools">
      <div class="config-tools-title">Available tools (${item.tools.length})</div>
      ${toolsList}
      ${item.tools.length > 15 ? `<div class="config-tool-item" style="color:var(--text-dim)">+${item.tools.length - 15} more</div>` : ''}
    </div>
    <div class="config-actions">
      <button class="btn btn-secondary" id="config-disconnect">Disconnect</button>
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
  btn.textContent = 'Connecting...';

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
    btn.textContent = 'Connect';
    const errorDiv = document.createElement('div');
    errorDiv.className = 'config-error';
    errorDiv.textContent = err instanceof Error ? err.message : String(err);
    configBody.prepend(errorDiv);
  }
}

async function handleDisconnect(id: string): Promise<void> {
  const btn = document.getElementById('config-disconnect') as HTMLButtonElement;
  btn.disabled = true;
  btn.textContent = 'Disconnecting...';

  try {
    await invoke('integrations_disconnect', { id });
    await refreshCatalog();
    configPanel.classList.remove('open');
  } catch {
    btn.disabled = false;
    btn.textContent = 'Disconnect';
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
  id: 'ID',
  oauth: 'OAuth',
  uri: 'URI',
  ssh: 'SSH',
  http: 'HTTP',
  https: 'HTTPS',
  sql: 'SQL',
  crm: 'CRM',
};

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
  configPanel.classList.remove('open');
});

// Palette setup
document.body.classList.add('in-palette');
document.documentElement.style.background = 'transparent';

(document.getElementById('palette-back') as HTMLButtonElement).addEventListener('click', () => {
  invoke('navigate_back');
});

// Load both catalogs in parallel
Promise.all([
  invoke<IntegrationStatus[]>('integrations_list_catalog').catch(() => []),
  invoke<TelegramStatus>('get_telegram_status').catch(() => ({ bots: [] })),
]).then(([mcpCatalog, tgStatus]) => {
  catalog = mcpCatalog;
  telegramBots = tgStatus.bots ?? [];
  renderTabs();
  renderGrid();
});
