import { html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { Update } from '@tauri-apps/plugin-updater';
import { LightDomElement } from '../shared/light-dom-element.js';
import { adoptGlobalStyles, adoptStyles } from '../shared/styles/inject.js';
import { paletteViewStyles } from './styles/index.js';
import type { TelegramBot } from '../shared/types.js';
import { getStatus, getTelegramStatus } from '../shared/ipc.js';
import { t, getLocale, initLocale, applyTranslations, UI_LANGUAGES } from '../i18n.js';
import { executeCommand, hidePalette } from './ipc.js';

/** Map command id → icon file in /icons/ and whether it needs mono filter */
const COMMAND_ICONS: Record<string, { src: string; mono: boolean }> = {
  canvas: { src: '/icons/share-2.svg', mono: true },
  brain: { src: '/icons/brain.svg', mono: true },
  integrations: { src: '/icons/plug.svg', mono: true },
  language: { src: '/icons/globe.svg', mono: true },
  setup: { src: '/icons/sparkles.svg', mono: true },
  update: { src: '/icons/refresh-cw.svg', mono: true },
  quit: { src: '/icons/power.svg', mono: true },
  status: { src: '/icons/clock.svg', mono: true },
  doctor: { src: '/icons/heart-pulse.svg', mono: true },
  audit: { src: '/icons/clipboard-list.svg', mono: true },
  docs: { src: '/icons/book-open.svg', mono: true },
  telegram: { src: '/icons/telegram.svg', mono: false },
};

adoptGlobalStyles();
adoptStyles(...paletteViewStyles);

import './palette-command-row.js';
import './palette-telegram-panel.js';

interface Command {
  readonly id: string;
  readonly labelKey: string;
  hint: string;
}

const MAIN_COMMANDS: Command[] = [
  { id: 'canvas', labelKey: 'palette.squad', hint: '' },
  { id: 'brain', labelKey: 'palette.brain', hint: '' },
  { id: 'integrations', labelKey: 'palette.integrations', hint: '' },
  { id: 'language', labelKey: 'palette.language', hint: '' },
  { id: 'setup', labelKey: 'palette.aiProvider', hint: '' },
  { id: 'update', labelKey: 'palette.checkForUpdates', hint: '' },
  { id: 'quit', labelKey: 'palette.quit', hint: '' },
];

const DEV_COMMANDS: Command[] = [
  { id: 'status', labelKey: 'palette.daemonStatus', hint: '' },
  { id: 'doctor', labelKey: 'palette.healthCheck', hint: '' },
  { id: 'audit', labelKey: 'palette.auditLog', hint: '' },
  { id: 'docs', labelKey: 'palette.documentation', hint: '' },
];

@customElement('sauria-palette')
export class SauriaPalette extends LightDomElement {
  @state() private selectedIndex = 0;
  @state() private devMode = false;
  @state() private activePanel: 'commands' | 'telegram' | 'result' = 'commands';
  @state() private resultText = '';
  @state() private searchValue = '';
  @state() private updateBanner: Update | null = null;
  @state() private installing = false;

  private unlisteners: UnlistenFn[] = [];

  override connectedCallback() {
    super.connectedCallback();
    this.init();
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    for (const fn of this.unlisteners) fn();
    document.removeEventListener('keydown', this.handleKeydown);
  }

  private async init() {
    await initLocale();
    this.updateLangHint();
    applyTranslations();
    this.refreshProviderStatus();
    this.refreshTelegramHint();
    this.checkForUpdate();

    document.addEventListener('keydown', this.handleKeydown);

    this.unlisteners.push(
      await listen<string>('command-result', (event) => {
        this.resultText = event.payload;
        this.activePanel = 'result';
      }),
      await listen('show-telegram-form', () => {
        this.activePanel = 'telegram';
      }),
      await listen('palette-show', () => {
        this.refreshProviderStatus();
        this.updateLangHint();
        this.focusSearch();
      }),
      await listen('palette-reset', () => {
        this.resetState();
      }),
    );
  }

  private get commands(): Command[] {
    return this.devMode ? DEV_COMMANDS : MAIN_COMMANDS;
  }

  private get filtered(): Command[] {
    const query = this.searchValue.toLowerCase();
    return this.commands.filter((c) => {
      const label = t(c.labelKey).toLowerCase();
      return label.includes(query) || c.hint.toLowerCase().includes(query) || c.id.includes(query);
    });
  }

  override render() {
    const filtered = this.filtered;
    const isInSubView = this.activePanel !== 'commands';

    return html`
      <div class="palette">
        ${isInSubView || this.devMode
          ? html`
              <div class="search-bar">
                <div
                  class="search-icon"
                  @mousedown=${(e: Event) => {
                    e.preventDefault();
                    this.exitSubView();
                  }}
                >
                  <img class="icon-mono" src="/icons/chevron-left.svg" alt="" />
                </div>
                <input
                  type="text"
                  placeholder="${this.devMode
                    ? t('palette.devTools')
                    : t('palette.searchPlaceholder')}"
                  autofocus
                  .value=${this.searchValue}
                  @input=${this.handleSearchInput}
                />
              </div>
            `
          : nothing}
        ${this.activePanel === 'commands'
          ? html`
              ${filtered.length > 0
                ? html`
                    <div
                      class="command-list"
                      @mousedown=${this.handleListClick}
                      @mousemove=${this.handleListHover}
                    >
                      ${this.devMode
                        ? html`<div class="section-header">
                            <span>${t('palette.developer')}</span>
                            <span class="section-line"></span>
                          </div>`
                        : nothing}
                      ${filtered.map(
                        (c, i) => html`
                          <div
                            class="command-row ${i === this.selectedIndex ? 'selected' : ''}"
                            data-index="${i}"
                          >
                            <div class="icon">
                              ${COMMAND_ICONS[c.id]
                                ? html`<img
                                    class="${COMMAND_ICONS[c.id]!.mono ? 'icon-mono' : ''}"
                                    src="${COMMAND_ICONS[c.id]!.src}"
                                    alt=""
                                  />`
                                : nothing}
                            </div>
                            <div class="label">${t(c.labelKey)}</div>
                            ${c.hint
                              ? html`<div class="hint">${unsafeHTML(c.hint)}</div>`
                              : nothing}
                          </div>
                        `,
                      )}
                    </div>
                  `
                : html`<div class="empty-state" data-i18n="palette.noResults">
                    ${t('palette.noResults')}
                  </div>`}
            `
          : nothing}
        ${this.activePanel === 'result'
          ? html`<div class="result-panel visible">${this.resultText}</div>`
          : nothing}
        ${this.activePanel === 'telegram'
          ? html`
              <div class="telegram-form visible">
                <palette-telegram-panel
                  @panel-close=${() => this.exitSubView()}
                ></palette-telegram-panel>
              </div>
            `
          : nothing}
        <div class="footer">
          <span style="flex:1">
            <img
              src="/icons/sauria-logo-40.png"
              alt=""
              style="width:28px;height:28px;border-radius:var(--spacing-xs)"
            />
            <span class="brand-label">SAURIA</span>
          </span>
          <button
            class="settings-btn ${this.devMode ? 'active' : ''}"
            title="Developer settings"
            @mousedown=${this.handleSettingsClick}
          >
            <img class="icon-mono" src="/icons/settings.svg" alt="" />
          </button>
        </div>
      </div>

      ${this.updateBanner ? this.renderUpdateBanner() : nothing}
    `;
  }

  private renderUpdateBanner() {
    return html`
      <div class="update-banner visible">
        <span>${t('palette.updateAvailable')}: ${this.updateBanner!.version}</span>
        <button class="update-btn" ?disabled=${this.installing} @click=${this.handleInstallUpdate}>
          ${this.installing ? t('palette.installing') : 'Install & Restart'}
        </button>
      </div>
    `;
  }

  private handleKeydown = (e: KeyboardEvent) => {
    if (this.activePanel === 'telegram') return;

    const filtered = this.filtered;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (filtered.length > 0) {
        this.selectedIndex = (this.selectedIndex + 1) % filtered.length;
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (filtered.length > 0) {
        this.selectedIndex = (this.selectedIndex - 1 + filtered.length) % filtered.length;
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      this.executeSelected();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (this.activePanel !== 'commands') {
        this.exitSubView();
      } else if (this.devMode) {
        this.exitDevMode();
      } else if (this.searchValue !== '') {
        this.searchValue = '';
        this.selectedIndex = 0;
      } else {
        hidePalette();
      }
    }
  };

  private handleSearchInput(e: Event) {
    this.searchValue = (e.target as HTMLInputElement).value;
    this.selectedIndex = 0;
    if (this.activePanel !== 'commands') this.exitSubView();
    if (this.devMode) this.exitDevMode();
  }

  private handleListClick(e: MouseEvent) {
    const row = (e.target as HTMLElement).closest('.command-row') as HTMLElement | null;
    if (!row) return;
    e.preventDefault();
    this.selectedIndex = parseInt(row.dataset['index']!, 10);
    this.executeSelected();
  }

  private handleListHover(e: MouseEvent) {
    const row = (e.target as HTMLElement).closest('.command-row') as HTMLElement | null;
    if (!row) return;
    const idx = parseInt(row.dataset['index']!, 10);
    if (idx !== this.selectedIndex) this.selectedIndex = idx;
  }

  private handleSettingsClick(e: MouseEvent) {
    e.preventDefault();
    if (this.activePanel !== 'commands') {
      this.exitSubView();
      return;
    }
    if (this.devMode) {
      this.exitDevMode();
      return;
    }
    this.devMode = true;
    this.selectedIndex = 0;
    this.searchValue = '';
    this.focusSearch();
  }

  private executeSelected() {
    const filtered = this.filtered;
    if (filtered.length === 0) return;
    const cmd = filtered[this.selectedIndex];
    if (!cmd) return;

    if (cmd.id === 'update') {
      this.manualCheckForUpdate();
      return;
    }
    executeCommand(cmd.id);
  }

  private exitSubView() {
    this.activePanel = 'commands';
    this.searchValue = '';
    if (this.devMode) this.exitDevMode();
  }

  private exitDevMode() {
    this.devMode = false;
    this.selectedIndex = 0;
    this.searchValue = '';
  }

  private resetState() {
    this.searchValue = '';
    this.selectedIndex = 0;
    this.devMode = false;
    this.activePanel = 'commands';
  }

  private focusSearch() {
    requestAnimationFrame(() => {
      this.querySelector<HTMLInputElement>('input[type="text"]')?.focus();
    });
  }

  private refreshProviderStatus() {
    getStatus().then((status) => {
      const setupCmd = MAIN_COMMANDS.find((c) => c.id === 'setup');
      if (!setupCmd) return;
      if (status.connected && status.provider) {
        const method = status.authMethod === 'oauth' ? 'subscription' : 'API key';
        setupCmd.hint = `<span class="status-dot connected"></span>${status.provider} (${method})`;
      } else {
        setupCmd.hint = `<span class="status-dot disconnected"></span>${t('palette.noProvider')}`;
      }
      if (!this.devMode) this.requestUpdate();
    });
  }

  private refreshTelegramHint() {
    getTelegramStatus().then((status) => {
      const tgCmd = MAIN_COMMANDS.find((c) => c.id === 'telegram');
      if (!tgCmd) return;
      const bots = status.bots ?? [];
      const count = bots.filter((b: TelegramBot) => b.connected).length;
      if (count > 0) {
        tgCmd.hint = count === 1 ? 'connected' : `${count} bots`;
        if (!this.devMode) this.requestUpdate();
      }
    });
  }

  private updateLangHint() {
    const langCmd = MAIN_COMMANDS.find((c) => c.id === 'language');
    if (!langCmd) return;
    const active = UI_LANGUAGES.find((l) => l.code === getLocale());
    langCmd.hint = active?.label ?? '';
  }

  private async checkForUpdate(manual = false) {
    const updateCmd = MAIN_COMMANDS.find((c) => c.id === 'update');

    if (manual && updateCmd) {
      updateCmd.hint = '<span class="spinner-inline"></span>';
      this.requestUpdate();
    }

    try {
      const { check } = await import('@tauri-apps/plugin-updater');
      const update = await check();

      if (update) {
        if (updateCmd) {
          updateCmd.hint = `<span class="status-dot disconnected"></span>${t('palette.updateAvailable')} ${update.version}`;
          this.requestUpdate();
        }
        this.updateBanner = update;
      } else if (manual && updateCmd) {
        updateCmd.hint = `<span class="status-dot connected"></span>${t('palette.noUpdateAvailable')}`;
        this.requestUpdate();
      }
    } catch {
      if (manual && updateCmd) {
        updateCmd.hint = `<span class="status-dot disconnected"></span>${t('palette.updateError')}`;
        this.requestUpdate();
      }
    }
  }

  private manualCheckForUpdate() {
    this.checkForUpdate(true);
  }

  private async handleInstallUpdate() {
    if (!this.updateBanner) return;
    this.installing = true;
    await this.updateBanner.downloadAndInstall();
  }
}
