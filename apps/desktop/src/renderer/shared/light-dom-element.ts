import { LitElement } from 'lit';

export class LightDomElement extends LitElement {
  override createRenderRoot() {
    return this;
  }
}
