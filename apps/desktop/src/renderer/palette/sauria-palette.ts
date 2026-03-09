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

adoptGlobalStyles();
adoptStyles(...paletteViewStyles);

import './palette-command-row.js';
import './palette-telegram-panel.js';
import './palette-language-panel.js';

interface Command {
  readonly id: string;
  readonly labelKey: string;
  hint: string;
}

const ICONS: Record<string, string> = {
  canvas:
    '<svg viewBox="0 0 24 24" fill="none"><circle cx="5" cy="6" r="2.5" stroke="rgba(255,255,255,0.5)" stroke-width="1.5"/><circle cx="19" cy="6" r="2.5" stroke="rgba(255,255,255,0.5)" stroke-width="1.5"/><circle cx="12" cy="18" r="2.5" stroke="rgba(255,255,255,0.5)" stroke-width="1.5"/><path d="M7.5 6h9M6.2 8.3l4.6 7.9M17.8 8.3l-4.6 7.9" stroke="rgba(255,255,255,0.3)" stroke-width="1.2" stroke-linecap="round"/></svg>',
  status:
    '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="rgba(255,255,255,0.5)" stroke-width="1.5"/><path d="M12 7v5l3 3" stroke="rgba(255,255,255,0.7)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  telegram:
    '<svg viewBox="0 0 24 24"><path d="M9.04 15.6l-.39 5.36c.56 0 .8-.24 1.1-.52l2.63-2.5 5.45 3.97c1 .55 1.7.26 1.97-.92l3.57-16.67C23.71 2.7 22.85 2.14 21.9 2.5L1.4 10.17c-1.63.64-1.6 1.56-.28 1.98l5.1 1.58L19.5 5.8c.6-.38 1.15-.17.7.2L9.04 15.6z" fill="#27A7E7"/></svg>',
  setup:
    '<svg viewBox="0 0 24 24" fill="none"><path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" stroke="rgba(255,255,255,0.5)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M19 13l.75 2.25L22 16l-2.25.75L19 19l-.75-2.25L16 16l2.25-.75L19 13z" stroke="rgba(255,255,255,0.35)" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  audit:
    '<svg viewBox="0 0 24 24" fill="none"><rect x="5" y="2" width="14" height="20" rx="2" stroke="rgba(255,255,255,0.5)" stroke-width="1.5"/><path d="M9 7h6M9 11h6M9 15h4" stroke="rgba(255,255,255,0.5)" stroke-width="1.5" stroke-linecap="round"/></svg>',
  doctor:
    '<svg viewBox="0 0 24 24" fill="none"><path d="M12 20s-7-5.75-7-10.25A4.5 4.5 0 0112 6a4.5 4.5 0 017 3.75C19 14.25 12 20 12 20z" stroke="rgba(255,255,255,0.5)" stroke-width="1.5" stroke-linejoin="round"/><path d="M12 10v4M10 12h4" stroke="rgba(255,255,255,0.7)" stroke-width="1.5" stroke-linecap="round"/></svg>',
  docs: '<svg viewBox="0 0 24 24" fill="none"><path d="M4 19.5A2.5 2.5 0 016.5 17H20" stroke="rgba(255,255,255,0.5)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" stroke="rgba(255,255,255,0.5)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  quit: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 3v9" stroke="rgba(255,255,255,0.5)" stroke-width="1.5" stroke-linecap="round"/><path d="M18.36 6.64A9 9 0 0112 21a9 9 0 01-6.36-2.36A9 9 0 015.64 6.64" stroke="rgba(255,255,255,0.5)" stroke-width="1.5" stroke-linecap="round"/></svg>',
  brain:
    '<svg viewBox="0 0 24 24" fill="none"><path d="M12 5a3 3 0 10-5.997.125A4 4 0 003 9a4 4 0 001.4 3.04A3.5 3.5 0 005 15a3.5 3.5 0 002.84 3.44A3 3 0 0011 21h1a3 3 0 003.16-2.56A3.5 3.5 0 0019 15a3.5 3.5 0 00-.6-2.96A4 4 0 0021 9a4 4 0 00-2.99-3.87A3 3 0 0012 5z" stroke="rgba(255,255,255,0.5)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 5v16" stroke="rgba(255,255,255,0.3)" stroke-width="1" stroke-linecap="round"/><path d="M9.5 8a5.5 5.5 0 00-4.13 4M14.5 8a5.5 5.5 0 014.13 4" stroke="rgba(255,255,255,0.2)" stroke-width="1" stroke-linecap="round"/></svg>',
  integrations:
    '<svg viewBox="0 0 24 24" fill="none"><path d="M12 22c5.523 0 10-4.477 10-10h-4a6 6 0 01-6 6v4z" stroke="rgba(255,255,255,0.5)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 2C6.477 2 2 6.477 2 12h4a6 6 0 016-6V2z" stroke="rgba(255,255,255,0.5)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="17" cy="7" r="2" stroke="rgba(255,255,255,0.4)" stroke-width="1.5"/><circle cx="7" cy="17" r="2" stroke="rgba(255,255,255,0.4)" stroke-width="1.5"/></svg>',
  language:
    '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="rgba(255,255,255,0.5)" stroke-width="1.5"/><path d="M2 12h20" stroke="rgba(255,255,255,0.3)" stroke-width="1.2"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10A15.3 15.3 0 0112 2z" stroke="rgba(255,255,255,0.5)" stroke-width="1.5"/></svg>',
  update:
    '<svg viewBox="0 0 24 24" fill="none"><path d="M21 12a9 9 0 01-9 9m0 0a9 9 0 01-9-9m9 9v-4m0 0l-3 3m3-3l3 3M3 12a9 9 0 019-9m0 0V7m0-4l3 3m-3-3L9 6" stroke="rgba(255,255,255,0.5)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

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
  @state() private activePanel: 'commands' | 'telegram' | 'language' | 'result' = 'commands';
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
    const showBackBtn = isInSubView || this.devMode;

    return html`
      <div class="palette">
        <div class="search-bar">
          <div
            class="search-icon ${showBackBtn ? '' : 'hidden'}"
            @mousedown=${(e: Event) => {
              e.preventDefault();
              this.exitSubView();
            }}
          >
            <svg viewBox="0 0 24 24" fill="none">
              <path
                d="M15 18l-6-6 6-6"
                stroke="rgba(255,255,255,0.5)"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </div>
          <input
            type="text"
            data-i18n-placeholder="palette.searchPlaceholder"
            placeholder="${this.devMode ? t('palette.devTools') : t('palette.searchPlaceholder')}"
            autofocus
            .value=${this.searchValue}
            @input=${this.handleSearchInput}
          />
        </div>

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
                            <div class="icon">${unsafeHTML(ICONS[c.id] ?? '')}</div>
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
        ${this.activePanel === 'language'
          ? html`
              <div class="language-panel visible">
                <palette-language-panel
                  @panel-close=${() => this.exitSubView()}
                  @language-changed=${this.handleLanguageChanged}
                ></palette-language-panel>
              </div>
            `
          : nothing}

        <div class="footer">
          <span style="display:flex;align-items:center;gap:4px;flex:1">
            <img
              src="/icons/sauria-logo-40.png"
              alt=""
              style="width:12px;height:12px;border-radius:2px"
            />
            <span class="brand-label">Sauria</span>
          </span>
          <button
            class="settings-btn ${this.devMode ? 'active' : ''}"
            title="Developer settings"
            @mousedown=${this.handleSettingsClick}
          >
            <svg viewBox="0 0 24 24" fill="none">
              <path
                d="M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 00.73 2.73l.15.1a2 2 0 011 1.72v.51a2 2 0 01-1 1.74l-.15.09a2 2 0 00-.73 2.73l.22.38a2 2 0 002.73.73l.15-.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.39a2 2 0 00-.73-2.73l-.15-.08a2 2 0 01-1-1.74v-.5a2 2 0 011-1.74l.15-.09a2 2 0 00.73-2.73l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2z"
                stroke="rgba(255,255,255,0.3)"
                stroke-width="1.5"
              />
              <circle cx="12" cy="12" r="3" stroke="rgba(255,255,255,0.3)" stroke-width="1.5" />
            </svg>
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
    if (this.activePanel === 'telegram' || this.activePanel === 'language') return;

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

    if (cmd.id === 'language') {
      this.activePanel = 'language';
      return;
    }
    if (cmd.id === 'update') {
      this.manualCheckForUpdate();
      return;
    }
    executeCommand(cmd.id);
  }

  private exitSubView() {
    this.activePanel = 'commands';
    if (this.devMode) this.exitDevMode();
    this.focusSearch();
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
    this.focusSearch();
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

  private handleLanguageChanged(e: CustomEvent<{ label: string }>) {
    const langCmd = MAIN_COMMANDS.find((c) => c.id === 'language');
    if (langCmd) langCmd.hint = e.detail.label;
    this.requestUpdate();
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
