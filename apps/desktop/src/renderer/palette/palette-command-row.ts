import { html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { LightDomElement } from '../shared/light-dom-element.js';

@customElement('palette-command-row')
export class PaletteCommandRow extends LightDomElement {
  @property() label = '';
  @property() hint = '';
  @property() iconSvg = '';
  @property({ type: Number }) index = 0;
  @property({ type: Boolean, reflect: true }) selected = false;

  override render() {
    return html`
      <div class="command-row ${this.selected ? 'selected' : ''}" data-index="${this.index}">
        <div class="icon">${unsafeHTML(this.iconSvg)}</div>
        <div class="label">${this.label}</div>
        ${this.hint ? html`<div class="hint">${unsafeHTML(this.hint)}</div>` : ''}
      </div>
    `;
  }
}
