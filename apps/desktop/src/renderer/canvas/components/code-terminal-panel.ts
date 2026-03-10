import { html, nothing, type TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { LightDomElement } from '../light-dom-element.js';
import { adoptStyles } from '../../shared/styles/inject.js';
import { codeTerminalStyles } from './code-terminal-styles.js';
import {
  openCodeTerminal,
  writeCodeTerminal,
  resizeCodeTerminal,
  closeCodeTerminal,
  hasCodeTerminal,
  attachCodeTerminal,
  detachCodeTerminal,
  discoverCodeSessionId,
} from '../ipc.js';
import type { AgentNode } from '../types.js';
import { capitalize } from '../helpers.js';

import '@xterm/xterm/css/xterm.css';

adoptStyles(codeTerminalStyles);

type DockPosition = 'bottom' | 'top' | 'left' | 'right';

interface TerminalDataPayload {
  readonly nodeId: string;
  readonly data: number[];
}

const DOCK_ICONS: Record<DockPosition, TemplateResult> = {
  bottom: html`<svg viewBox="0 0 12 12" fill="none">
    <rect
      x="0.5"
      y="0.5"
      width="11"
      height="11"
      rx="1.5"
      stroke="currentColor"
      stroke-opacity="0.4"
    />
    <rect x="1" y="7" width="10" height="4" rx="1" fill="currentColor" />
  </svg>`,
  top: html`<svg viewBox="0 0 12 12" fill="none">
    <rect
      x="0.5"
      y="0.5"
      width="11"
      height="11"
      rx="1.5"
      stroke="currentColor"
      stroke-opacity="0.4"
    />
    <rect x="1" y="1" width="10" height="4" rx="1" fill="currentColor" />
  </svg>`,
  left: html`<svg viewBox="0 0 12 12" fill="none">
    <rect
      x="0.5"
      y="0.5"
      width="11"
      height="11"
      rx="1.5"
      stroke="currentColor"
      stroke-opacity="0.4"
    />
    <rect x="1" y="1" width="4" height="10" rx="1" fill="currentColor" />
  </svg>`,
  right: html`<svg viewBox="0 0 12 12" fill="none">
    <rect
      x="0.5"
      y="0.5"
      width="11"
      height="11"
      rx="1.5"
      stroke="currentColor"
      stroke-opacity="0.4"
    />
    <rect x="7" y="1" width="4" height="10" rx="1" fill="currentColor" />
  </svg>`,
};

@customElement('code-terminal-panel')
export class CodeTerminalPanel extends LightDomElement {
  @property({ attribute: false }) node: AgentNode | null = null;
  @property({ type: Number }) rightOffset = 0;
  @state() private isOpen = false;
  @state() private dockPosition: DockPosition = 'bottom';

  private terminal: Terminal | null = null;
  private fitAddon: FitAddon | null = null;
  private unlistenData?: UnlistenFn;
  private resizeObserver?: ResizeObserver;

  async open(node: AgentNode): Promise<void> {
    if (this.isOpen && this.node?.id === node.id) return;

    await this.close();

    this.node = node;
    this.isOpen = true;
    await this.updateComplete;

    const container = this.querySelector('.code-terminal-body') as HTMLElement;
    if (!container) return;

    const cs = getComputedStyle(document.documentElement);
    this.terminal = new Terminal({
      theme: {
        background: cs.getPropertyValue('--bg-solid').trim() || '#0a0a0a',
        foreground: cs.getPropertyValue('--text').trim() || '#e5e5e5',
        cursor: cs.getPropertyValue('--accent').trim() || '#6366f1',
      },
      fontFamily: cs.getPropertyValue('--font-family-mono').trim() || 'Geist Mono, monospace',
      fontSize: parseInt(cs.getPropertyValue('--font-size-small').trim(), 10) || 12,
      cursorBlink: true,
      allowProposedApi: true,
    });

    this.fitAddon = new FitAddon();
    this.terminal.loadAddon(this.fitAddon);
    this.terminal.open(container);

    requestAnimationFrame(() => this.fitAddon?.fit());

    this.terminal.onData((data) => {
      if (!this.node) return;
      const bytes = Array.from(new TextEncoder().encode(data));
      writeCodeTerminal(this.node.id, bytes).catch(() => {});
    });

    this.unlistenData = await listen<TerminalDataPayload>('code-terminal-data', (event) => {
      if (event.payload.nodeId === this.node?.id) {
        this.terminal?.write(new Uint8Array(event.payload.data));
      }
    });

    this.resizeObserver = new ResizeObserver(() => {
      if (!this.fitAddon || !this.terminal || !this.node) return;
      this.fitAddon.fit();
      resizeCodeTerminal(this.node.id, this.terminal.cols, this.terminal.rows).catch(() => {});
    });
    this.resizeObserver.observe(container);

    // Reattach to existing PTY or create a new one
    const hasExisting = await hasCodeTerminal(node.id);
    if (hasExisting) {
      const buffered = await attachCodeTerminal(node.id);
      if (buffered.length > 0) {
        this.terminal.write(new Uint8Array(buffered));
      }
    } else {
      const projectPath = node.codeMode?.projectPath ?? '';
      const permissionMode = node.codeMode?.permissionMode ?? 'default';
      const sessionId = node.codeMode?.sessionId;
      await openCodeTerminal(node.id, projectPath, permissionMode, sessionId);
      // Only mark active on fresh spawn — reattach means it was already active
      this.fireSessionUpdate(node.id, node.codeMode?.sessionId, true);
    }
  }

  async close(): Promise<void> {
    if (!this.isOpen) return;
    await this.teardown('detach');
  }

  async destroy(): Promise<void> {
    if (!this.isOpen) return;
    await this.teardown('kill');
  }

  /** Shared teardown for close (detach PTY) and destroy (kill PTY). */
  private async teardown(mode: 'detach' | 'kill'): Promise<void> {
    const nodeId = this.node?.id;
    const projectPath = this.node?.codeMode?.projectPath;

    this.isOpen = false;
    this.node = null;

    this.resizeObserver?.disconnect();
    this.resizeObserver = undefined;

    this.unlistenData?.();
    this.unlistenData = undefined;

    this.terminal?.dispose();
    this.terminal = null;
    this.fitAddon = null;

    if (nodeId) {
      if (mode === 'detach') {
        await detachCodeTerminal(nodeId).catch(() => {});
      } else {
        await closeCodeTerminal(nodeId).catch(() => {});
      }
      const sessionId = projectPath
        ? await discoverCodeSessionId(projectPath).catch(() => null)
        : undefined;
      this.fireSessionUpdate(nodeId, sessionId ?? undefined, false);
    }

    this.fire('terminal-close');
  }

  updated(changed: Map<string, unknown>): void {
    if (changed.has('rightOffset') && this.fitAddon) {
      requestAnimationFrame(() => this.fitAddon?.fit());
    }
  }

  private setDock(pos: DockPosition): void {
    this.dockPosition = pos;
    requestAnimationFrame(() => this.fitAddon?.fit());
  }

  private fire(name: string): void {
    this.dispatchEvent(new CustomEvent(name, { bubbles: true, composed: true }));
  }

  private fireSessionUpdate(
    nodeId: string,
    sessionId: string | undefined,
    terminalActive: boolean,
  ): void {
    this.dispatchEvent(
      new CustomEvent('terminal-session-update', {
        bubbles: true,
        composed: true,
        detail: { nodeId, sessionId, terminalActive },
      }),
    );
  }

  render() {
    const { node, dockPosition } = this;

    const offset = this.rightOffset;
    let offsetStyle = '';
    if (offset > 0) {
      if (dockPosition === 'bottom' || dockPosition === 'top') {
        offsetStyle = `right: ${offset}px`;
      } else if (dockPosition === 'right') {
        offsetStyle = `right: ${offset}px; width: calc(50vw - ${offset}px)`;
      }
    }

    return html`
      <div
        class="code-terminal-panel dock-${dockPosition} ${this.isOpen ? 'open' : ''}"
        style=${offsetStyle}
      >
        ${this.isOpen && node
          ? html`
              <div class="code-terminal-header">
                <div class="code-terminal-title-group">
                  <span class="code-terminal-title">${node.label}</span>
                  <span class="code-terminal-badge"
                    >${capitalize(node.codeMode?.permissionMode ?? 'default')}</span
                  >
                </div>
                <div class="code-terminal-dock-btns">
                  ${(['top', 'bottom', 'left', 'right'] as const).map(
                    (pos) => html`
                      <button
                        class="code-terminal-dock-btn ${dockPosition === pos ? 'active' : ''}"
                        title="Dock ${pos}"
                        @click=${() => this.setDock(pos)}
                      >
                        ${DOCK_ICONS[pos]}
                      </button>
                    `,
                  )}
                </div>
                <button
                  class="code-terminal-close"
                  @click=${() => this.close()}
                  title="Close terminal"
                >
                  <img src="/icons/x.svg" alt="Close" />
                </button>
              </div>
              <div class="code-terminal-body"></div>
            `
          : nothing}
      </div>
    `;
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.close().catch((err) => {
      console.warn('code-terminal-panel: teardown error', err);
    });
  }
}
