import { html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { LightDomElement } from '../shared/light-dom-element.js';
import { t } from '../i18n.js';

interface CategoryTab {
  readonly id: string;
  readonly labelKey: string;
}

@customElement('integration-category-tabs')
export class IntegrationCategoryTabs extends LightDomElement {
  @property({ attribute: false }) tabs: readonly CategoryTab[] = [];
  @property() activeCategory = 'all';

  override render() {
    return html`${this.tabs.map(
      (cat) => html`
        <button
          class="category-tab ${cat.id === this.activeCategory ? 'active' : ''}"
          @click=${() => this.handleClick(cat.id)}
        >
          ${t(cat.labelKey)}
        </button>
      `,
    )}`;
  }

  private handleClick(categoryId: string) {
    this.dispatchEvent(
      new CustomEvent('category-change', {
        detail: { category: categoryId },
        bubbles: true,
      }),
    );
  }
}
