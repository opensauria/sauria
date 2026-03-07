import { LitElement, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { AgentNode, IntegrationDef, IntegrationInstance } from '../types.js';
import { escapeHtml } from '../helpers.js';

const ORBITAL_GAP = 32;
const ORBITAL_OFFSET_X = 16;
const HIDE_DELAY_MS = 150;

/**
 * Orbital integration bubbles shown on agent card hover.
 * Light DOM — positioned in canvas-world coordinate space.
 */
@customElement('orbital-bubbles')
export class OrbitalBubbles extends LitElement {
  @property({ attribute: false }) node: AgentNode | null = null;
  @property({ attribute: false }) instances: IntegrationInstance[] = [];
  @property({ attribute: false }) catalogMap = new Map<string, IntegrationDef>();
  @property({ attribute: false }) worldEl: HTMLElement | null = null;

  private hideTimer: ReturnType<typeof setTimeout> | null = null;

  createRenderRoot() {
    return this;
  }

  connectedCallback(): void {
    super.connectedCallback();
    this.addEventListener('mouseenter', this.handleBubbleEnter, true);
    this.addEventListener('mouseleave', this.handleBubbleLeave, true);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.removeEventListener('mouseenter', this.handleBubbleEnter, true);
    this.removeEventListener('mouseleave', this.handleBubbleLeave, true);
    if (this.hideTimer) clearTimeout(this.hideTimer);
  }

  /** Show bubbles for a node. */
  show(node: AgentNode): void {
    this.node = node;
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
  }

  /** Schedule hide with delay. */
  scheduleHide(): void {
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(() => {
      this.hideTimer = null;
      this.node = null;
    }, HIDE_DELAY_MS);
  }

  /** Immediately hide. */
  hide(): void {
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.hideTimer = null;
    this.node = null;
  }

  private handleBubbleEnter = (e: Event): void => {
    if ((e.target as HTMLElement).closest('.orbital-bubble')) {
      if (this.hideTimer) {
        clearTimeout(this.hideTimer);
        this.hideTimer = null;
      }
    }
  };

  private handleBubbleLeave = (e: Event): void => {
    if ((e.target as HTMLElement).closest('.orbital-bubble')) {
      this.scheduleHide();
    }
  };

  render() {
    return html``;
  }

  updated(): void {
    /* Clear old bubbles */
    const existing = this.querySelectorAll('.orbital-bubble');
    for (const el of existing) el.remove();

    const node = this.node;
    if (!node || !this.worldEl) return;

    const assigned = node.integrations ?? [];
    if (assigned.length === 0) return;

    const cardEl = this.worldEl.querySelector(
      `[data-node-id="${node.id}"]`,
    ) as HTMLElement | null;
    if (!cardEl) return;

    const cardRect = {
      x: node.position.x,
      y: node.position.y,
      w: cardEl.offsetWidth || 120,
      h: cardEl.offsetHeight || 160,
    };

    const bubbleData: Array<{ instanceId: string; integrationId: string; label: string }> = [];
    for (const iid of assigned) {
      const inst = this.instances.find((i) => i.id === iid);
      if (inst) {
        bubbleData.push({ instanceId: iid, integrationId: inst.integrationId, label: inst.label });
      }
    }
    if (bubbleData.length === 0) return;

    for (let i = 0; i < bubbleData.length; i++) {
      const b = bubbleData[i];
      const def = this.catalogMap.get(b.integrationId);
      const iconName = def?.icon ?? '';

      const isRightSide = bubbleData.length <= 4 || i < Math.ceil(bubbleData.length / 2);
      const sideIndex = isRightSide ? i : i - Math.ceil(bubbleData.length / 2);
      const totalOnSide = isRightSide
        ? (bubbleData.length <= 4 ? bubbleData.length : Math.ceil(bubbleData.length / 2))
        : bubbleData.length - Math.ceil(bubbleData.length / 2);

      const startY = cardRect.y + (cardRect.h - totalOnSide * ORBITAL_GAP) / 2 + 12;
      const by = startY + sideIndex * ORBITAL_GAP;
      const bx = isRightSide
        ? cardRect.x + cardRect.w + ORBITAL_OFFSET_X
        : cardRect.x - ORBITAL_OFFSET_X - 24;

      const bubble = document.createElement('div');
      bubble.className = 'orbital-bubble';
      bubble.dataset.orbitalNode = node.id;
      bubble.style.left = bx + 'px';
      bubble.style.top = by + 'px';
      bubble.style.animationDelay = i * 50 + 'ms';

      if (iconName) {
        bubble.innerHTML =
          '<img src="/icons/integrations/' + escapeHtml(iconName) +
          '.svg" alt="" onerror="this.style.display=\'none\'" />';
      }

      const tooltip = document.createElement('div');
      tooltip.className = 'orbital-tooltip';
      tooltip.textContent = b.label;
      bubble.appendChild(tooltip);

      this.appendChild(bubble);
    }
  }
}
