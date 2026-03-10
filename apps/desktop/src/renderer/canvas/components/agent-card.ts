import { html, nothing } from 'lit';
import { LightDomElement } from '../light-dom-element.js';
import { customElement, property } from 'lit/decorators.js';
import type { AgentNode } from '../types.js';
import { PLATFORM_ICONS, GEAR_SVG } from '../constants.js';
import { escapeHtml, getInitials, getBotInfo } from '../helpers.js';

/**
 * Agent card rendered in Light DOM (needs same coordinate space as canvas-world).
 * Renders 4 variants: owner, connected, setup/connecting/error, editing.
 */
@customElement('agent-card')
export class AgentCard extends LightDomElement {
  @property({ attribute: false }) node!: AgentNode;
  @property({ type: Boolean }) selected = false;
  @property({ type: Boolean }) active = false;

  connectedCallback(): void {
    super.connectedCallback();
    this.addEventListener('mouseenter', this.handleMouseEnter);
    this.addEventListener('mouseleave', this.handleMouseLeave);
    this.addEventListener('dblclick', this.handleDblClick);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.removeEventListener('mouseenter', this.handleMouseEnter);
    this.removeEventListener('mouseleave', this.handleMouseLeave);
    this.removeEventListener('dblclick', this.handleDblClick);
  }

  private handleMouseEnter = (): void => {
    this.dispatchEvent(
      new CustomEvent('card-hover', {
        bubbles: true,
        composed: true,
        detail: { nodeId: this.node.id },
      }),
    );
  };

  private handleMouseLeave = (): void => {
    this.dispatchEvent(
      new CustomEvent('card-hover-leave', {
        bubbles: true,
        composed: true,
        detail: { nodeId: this.node.id },
      }),
    );
  };

  private handleDblClick = (): void => {
    if (this.node?.codeMode?.enabled && this.node.status === 'connected') {
      this.dispatchEvent(
        new CustomEvent('card-action', {
          bubbles: true,
          composed: true,
          detail: { action: 'terminal', nodeId: this.node.id },
        }),
      );
    }
  };

  render() {
    const node = this.node;
    if (!node) return nothing;

    this.dataset.nodeId = node.id;
    this.style.left = node.position.x + 'px';
    this.style.top = node.position.y + 'px';

    /* Restore active glow ring */
    if (this.active && !this.querySelector('.glow-ring')) {
      const ring = document.createElement('div');
      ring.className = 'glow-ring';
      const mask = document.createElement('div');
      mask.className = 'glow-ring-mask';
      ring.appendChild(mask);
      this.prepend(ring);
    } else if (!this.active) {
      const existingRing = this.querySelector('.glow-ring');
      if (existingRing) existingRing.remove();
    }

    if (
      node.status === 'setup' ||
      node.status === 'connecting' ||
      node.status === 'error' ||
      node._editing
    ) {
      return this.renderSetupCard(node);
    }
    if (node.platform === 'owner') {
      return this.renderOwnerCard(node);
    }
    return this.renderConnectedCard(node);
  }

  private renderOwnerCard(node: AgentNode) {
    this.className =
      'agent-card owner-card' +
      (this.selected ? ' selected' : '') +
      (this.active ? ' node-active' : '');

    const avatarInner = node.photo
      ? `<img src="${escapeHtml(node.photo)}" alt="" draggable="false" />`
      : `<span class="avatar-initials">${getInitials(node.label)}</span>`;

    this.updateComplete.then(() => {
      const gear = this.querySelector('.card-gear');
      if (gear) gear.innerHTML = GEAR_SVG;
      const avatar = this.querySelector('.agent-avatar');
      if (avatar) avatar.innerHTML = avatarInner;
    });

    return html`
      <button class="card-gear" data-action="gear" title="Settings"></button>
      <div class="agent-avatar owner-avatar"></div>
      <div class="agent-name">${node.label}</div>
      <span class="platform-badge owner">YOU</span>
      <div class="port port-output" data-node-id=${node.id} data-port="output"></div>
    `;
  }

  private renderConnectedCard(node: AgentNode) {
    this.className =
      'agent-card' + (this.selected ? ' selected' : '') + (this.active ? ' node-active' : '');

    const photoHtml = node.photo
      ? `<img src="${escapeHtml(node.photo)}" alt="" draggable="false" />`
      : PLATFORM_ICONS[node.platform] || '';
    const displayName = node.meta.firstName || node.label.replace(/^@/, '');
    const botInfo = getBotInfo(node);

    this.updateComplete.then(() => {
      const gear = this.querySelector('.card-gear');
      if (gear) gear.innerHTML = GEAR_SVG;
      const avatar = this.querySelector('.agent-avatar');
      if (avatar) {
        /* Keep the status dot, replace only icon/photo */
        const dot = avatar.querySelector('.agent-status-dot');
        avatar.innerHTML = photoHtml;
        if (dot) avatar.appendChild(dot);
        else {
          const newDot = document.createElement('span');
          newDot.className = `agent-status-dot ${node.status}`;
          avatar.appendChild(newDot);
        }
      }
    });

    return html`
      <button class="card-gear" data-action="gear" title="Settings"></button>
      <div class="agent-avatar"></div>
      <div class="agent-name">${displayName}</div>
      ${botInfo ? html`<div class="agent-bot-info">${botInfo}</div>` : nothing}
      <span class="platform-badge ${node.platform}">${node.platform}</span>
      ${node.codeMode?.enabled
        ? html`<span class="code-badge"
            ><img class="icon-mono" src="/icons/code-xml.svg" alt="" /> Code</span
          >`
        : nothing}
      <div class="port port-input" data-node-id=${node.id} data-port="input"></div>
      <div class="port port-output" data-node-id=${node.id} data-port="output"></div>
    `;
  }

  private renderSetupCard(node: AgentNode) {
    /* Delegate to agent-card-setup — import handled at module level */
    const isEditing = node._editing === true;
    const isError = node.status === 'error';

    this.className =
      'agent-card' +
      (isError ? ' error-state' : '') +
      (node.status === 'setup' || node.status === 'connecting' || isEditing ? ' setup' : '') +
      (this.selected ? ' selected' : '');

    return html`
      <agent-card-setup
        .node=${node}
        ?isConnecting=${node.status === 'connecting'}
      ></agent-card-setup>
    `;
  }

  updated(): void {
    /* Drop-in animation */
    if (this.node?._animateIn) {
      this.classList.add('card-enter');
      delete this.node._animateIn;
      this.addEventListener('animationend', () => this.classList.remove('card-enter'), {
        once: true,
      });
    }
  }
}
