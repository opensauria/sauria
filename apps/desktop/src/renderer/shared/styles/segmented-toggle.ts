import { css } from 'lit';

export const segmentedToggleStyles = css`
  .segmented-toggle {
    display: flex;
    gap: 2px;
    background: var(--surface-light);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 2px;
    position: relative;
  }

  .segmented-highlight {
    position: absolute;
    top: 2px;
    bottom: 2px;
    left: 2px;
    width: calc(50% - 2px);
    border-radius: var(--radius-sm);
    background: var(--accent-subtle);
    transition: left 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    pointer-events: none;
  }

  .seg-btn {
    padding: var(--spacing-xs) var(--spacing-lg);
    font-size: var(--font-size-small);
    font-weight: 500;
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-dim);
    cursor: pointer;
    transition: color var(--transition-fast);
    position: relative;
    z-index: var(--z-base);
    font-family: inherit;
    line-height: var(--spacing-md);
  }

  .seg-btn:hover {
    color: var(--text-secondary);
  }

  .seg-btn.active {
    color: var(--accent);
  }

  /* Auth-style toggle (full-width buttons) */

  .auth-toggle {
    display: flex;
    gap: 0;
    background: var(--surface);
    border-radius: var(--radius-sm);
    padding: 2px;
    margin-bottom: var(--spacing-smd);
  }

  .auth-toggle-btn {
    flex: 1;
    padding: var(--spacing-sm) var(--spacing-smd);
    border: none;
    background: transparent;
    color: var(--text-secondary);
    font-size: var(--font-size-small);
    font-weight: 500;
    border-radius: calc(var(--radius-sm) - 2px);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .auth-toggle-btn:hover {
    color: var(--text);
  }

  .auth-toggle-btn.active {
    background: color-mix(in srgb, var(--accent) 12%, transparent);
    color: var(--accent);
  }
`;
