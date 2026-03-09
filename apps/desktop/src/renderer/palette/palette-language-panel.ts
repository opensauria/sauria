import { html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { LightDomElement } from '../shared/light-dom-element.js';
import { t, getLocale, setLocale, applyTranslations, UI_LANGUAGES } from '../i18n.js';

const CHECK_SVG =
  '<svg class="lang-check" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

@customElement('palette-language-panel')
export class PaletteLanguagePanel extends LightDomElement {
  @state() private currentLang = getLocale();

  override connectedCallback() {
    super.connectedCallback();
    this.addEventListener('keydown', this.handleKeydown);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this.removeEventListener('keydown', this.handleKeydown);
  }

  override render() {
    return html`
      <div class="tg-section-title" data-i18n="palette.interfaceLanguage">
        ${t('palette.interfaceLanguage')}
      </div>
      <div class="language-list" @mousedown=${this.handleSelect}>
        ${UI_LANGUAGES.map(
          (l) => html`
            <div
              class="lang-option ${l.code === this.currentLang ? 'active' : ''}"
              data-code="${l.code}"
            >
              ${CHECK_SVG}
              <span>${l.label}</span>
            </div>
          `,
        )}
      </div>
    `;
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

    this.dispatchEvent(
      new CustomEvent('language-changed', {
        detail: { code, label: UI_LANGUAGES.find((l) => l.code === code)?.label ?? '' },
        bubbles: true,
      }),
    );
  }

  private handleKeydown = (e: KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      this.dispatchEvent(new CustomEvent('panel-close', { bubbles: true }));
    }
  };
}
