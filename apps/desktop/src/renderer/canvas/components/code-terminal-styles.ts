import { css } from 'lit';

export const codeTerminalStyles = css`
  .code-terminal-panel {
    position: fixed;
    z-index: var(--z-overlay);
    display: flex;
    background: var(--bg-solid);
    overflow: hidden;
    transition:
      width var(--transition-normal) ease,
      height var(--transition-normal) ease,
      right var(--transition-normal) ease;
  }

  /* ── Dock positions ── */
  .code-terminal-panel.dock-bottom {
    bottom: 0;
    left: 0;
    right: 0;
    height: 0;
    flex-direction: column;
    border-top: 1px solid var(--border);
  }
  .code-terminal-panel.dock-bottom.open {
    height: 50vh;
  }

  .code-terminal-panel.dock-top {
    top: 0;
    left: 0;
    right: 0;
    height: 0;
    flex-direction: column;
    border-bottom: 1px solid var(--border);
  }
  .code-terminal-panel.dock-top.open {
    height: 50vh;
  }

  .code-terminal-panel.dock-left {
    top: 0;
    left: 0;
    bottom: 0;
    width: 0;
    flex-direction: column;
    border-right: 1px solid var(--border);
  }
  .code-terminal-panel.dock-left.open {
    width: 50vw;
  }

  .code-terminal-panel.dock-right {
    top: 0;
    right: 0;
    bottom: 0;
    width: 0;
    flex-direction: column;
    border-left: 1px solid var(--border);
  }
  .code-terminal-panel.dock-right.open {
    width: 50vw;
  }

  /* ── Header ── */
  .code-terminal-header {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    height: 40px;
    min-height: 40px;
    padding: 0 var(--spacing-md);
    background: var(--surface);
    border-bottom: 1px solid var(--border);
  }

  .code-terminal-title-group {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    flex: 1;
    min-width: 0;
  }

  .code-terminal-title {
    font-size: var(--font-size-base);
    font-weight: 600;
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .code-terminal-badge {
    display: flex;
    align-items: center;
    font-size: var(--font-size-micro);
    font-weight: 600;
    padding: 2px var(--spacing-sm);
    border-radius: var(--radius-sm);
    color: var(--accent);
    background: color-mix(in srgb, var(--accent) 12%, transparent);
    letter-spacing: 0.3px;
    white-space: nowrap;
    flex-shrink: 0;
  }

  /* ── Dock position buttons ── */
  .code-terminal-dock-btns {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .code-terminal-dock-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--spacing-lg);
    height: var(--spacing-lg);
    border: none;
    border-radius: var(--spacing-xs);
    background: transparent;
    color: var(--text-dim);
    cursor: pointer;
    transition: all var(--transition-fast);
  }
  .code-terminal-dock-btn:hover {
    background: var(--surface-hover);
    color: var(--text);
  }
  .code-terminal-dock-btn.active {
    color: var(--accent);
  }
  .code-terminal-dock-btn svg {
    width: var(--spacing-smd);
    height: var(--spacing-smd);
  }

  /* ── Close button ── */
  .code-terminal-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--spacing-lg);
    height: var(--spacing-lg);
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    transition: background var(--transition-fast);
  }

  .code-terminal-close:hover {
    background: var(--surface-hover);
  }

  .code-terminal-close img {
    width: var(--spacing-md);
    height: var(--spacing-md);
    filter: brightness(0) invert(1);
    opacity: var(--opacity-muted);
  }

  /* ── Body ── */
  .code-terminal-body {
    flex: 1;
    overflow: hidden;
    padding: var(--spacing-xs);
  }

  .code-terminal-body .xterm {
    height: 100%;
  }
`;
