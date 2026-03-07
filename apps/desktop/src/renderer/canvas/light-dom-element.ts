import { LitElement } from 'lit';

export class LightDomElement extends LitElement {
  override createRenderRoot() {
    return this;
  }

  protected fire(name: string, detail?: unknown): void {
    this.dispatchEvent(
      new CustomEvent(name, { bubbles: true, composed: true, detail }),
    );
  }
}
