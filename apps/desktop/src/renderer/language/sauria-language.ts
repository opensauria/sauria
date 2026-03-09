import { html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { LightDomElement } from '../shared/light-dom-element.js';
import { adoptGlobalStyles, adoptStyles } from '../shared/styles/inject.js';
import { languageViewStyles } from './styles.js';
import { t, getLocale, setLocale, applyTranslations, UI_LANGUAGES } from '../i18n.js';
import { navigateBack } from '../shared/ipc.js';

adoptGlobalStyles();
adoptStyles(...languageViewStyles);

@customElement('sauria-language')
export class SauriaLanguage extends LightDomElement {
  @state() private currentLang = getLocale();
  @state() private searchValue = '';

  override connectedCallback() {
    super.connectedCallback();
    document.addEventListener('keydown', this.handleKeydown);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('keydown', this.handleKeydown);
  }

  private get filtered() {
    const query = this.searchValue.toLowerCase();
    if (!query) return [...UI_LANGUAGES];
    return UI_LANGUAGES.filter((l) => l.label.toLowerCase().includes(query));
  }

  override render() {
    return html`
      <header class="language-header" data-tauri-drag-region>
        <button
          class="palette-back"
          title="${t('common.back')}"
          @click=${() => navigateBack()}
        >
          <img src="/icons/chevron-left.svg" alt="" />
        </button>
        <h1 class="language-title">${t('palette.interfaceLanguage')}</h1>
        <div class="language-search">
          <img class="icon-mono" src="/icons/search.svg" alt="" />
          <input
            type="text"
            placeholder="${t('palette.searchLanguages')}"
            autocomplete="off"
            .value=${this.searchValue}
            @input=${this.handleSearch}
          />
        </div>
      </header>

      <div class="language-body" @mousedown=${this.handleSelect}>
        ${this.filtered.map(
          (l) => html`
            <div
              class="lang-option ${l.code === this.currentLang ? 'active' : ''}"
              data-code="${l.code}"
            >
              <img class="lang-check" src="/icons/check.svg" alt="" />
              <span>${l.label}</span>
            </div>
          `,
        )}
      </div>
    `;
  }

  private handleSearch(e: Event) {
    this.searchValue = (e.target as HTMLInputElement).value;
  }

  private async handleSelect(e: MouseEvent) {
    const option = (e.target as HTMLElement).closest('.lang-option') as HTMLElement | null;
    if (!option) return;
    e.preventDefault();
    const code = option.dataset['code'];
    if (!code) return;

    await setLocale(code);
    applyTranslations();
    this.currentLang = getLocale();
  }

  private handleKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      navigateBack();
    }
  };
}
