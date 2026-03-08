import { html, nothing } from 'lit';
import { LightDomElement } from '../light-dom-element.js';
import { customElement, property } from 'lit/decorators.js';
import type { Workspace } from '../types.js';
import { escapeHtml, hexToRgba } from '../helpers.js';
import { LOCK_SVG, UNLOCK_SVG, GEAR_SVG } from '../constants.js';
import { fire } from '../fire.js';

@customElement('workspace-frame')
export class WorkspaceFrame extends LightDomElement {
  @property({ attribute: false }) workspace!: Workspace;
  @property({ type: Boolean }) selected = false;
  @property({ type: Number }) agentCount = 0;

  private handleLockClick(e: MouseEvent): void {
    e.preventDefault();
    e.stopPropagation();
    fire(this, 'workspace-lock-toggle', { wsId: this.workspace.id });
  }

  private handleGearClick(e: MouseEvent): void {
    e.preventDefault();
    e.stopPropagation();
    fire(this, 'workspace-edit', { wsId: this.workspace.id });
  }

  render() {
    const ws = this.workspace;
    if (!ws) return nothing;
    const isLocked = ws.locked === true;

    /* We render directly into the parent (Light DOM), so set host styles */
    this.className =
      'workspace-frame' + (this.selected ? ' selected' : '') + (isLocked ? ' locked' : '');
    this.dataset.workspaceId = ws.id;
    this.style.left = ws.position.x + 'px';
    this.style.top = ws.position.y + 'px';
    this.style.width = ws.size.width + 'px';
    this.style.height = ws.size.height + 'px';
    this.style.borderColor = ws.color;
    this.style.background = hexToRgba(ws.color, 0.04);

    /* innerHTML approach matches original exactly */
    return html`
      <div class="workspace-header" data-workspace-id=${ws.id}>
        <span class="workspace-name">${ws.name}</span>
        <span class="workspace-count">${this.agentCount}</span>
        ${ws.purpose ? html`<span class="workspace-purpose">${ws.purpose}</span>` : nothing}
        <button
          class="ws-lock ${isLocked ? 'locked' : ''}"
          title=${isLocked ? 'Unlock' : 'Lock'}
          @click=${this.handleLockClick}
        ></button>
        <button class="ws-gear" title="Edit workspace" @click=${this.handleGearClick}></button>
      </div>
      <div class="workspace-resize workspace-resize-r" data-ws-id=${ws.id} data-dir="r"></div>
      <div class="workspace-resize workspace-resize-b" data-ws-id=${ws.id} data-dir="b"></div>
      <div class="workspace-resize workspace-resize-br" data-ws-id=${ws.id} data-dir="br"></div>
    `;
  }

  updated(): void {
    /* Set innerHTML for SVG icons since lit html doesn't support raw SVG strings safely */
    const lockBtn = this.querySelector('.ws-lock');
    if (lockBtn) {
      lockBtn.innerHTML = this.workspace.locked ? LOCK_SVG : UNLOCK_SVG;
    }
    const gearBtn = this.querySelector('.ws-gear');
    if (gearBtn) {
      gearBtn.innerHTML = GEAR_SVG;
    }
  }
}
