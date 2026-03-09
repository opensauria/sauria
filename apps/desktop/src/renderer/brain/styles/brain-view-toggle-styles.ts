import { css } from 'lit';

export const brainViewToggleStyles = css`
  .brain-view-toggle {
    position: absolute;
    top: var(--spacing-md);
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    gap: 2px;
    background: var(--surface-light);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 2px;
    z-index: var(--z-dropdown);
  }

  .brain-view-highlight {
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

  .brain-view-toggle[data-active='library'] .brain-view-highlight {
    left: 50%;
  }

  .brain-view-seg {
    padding: var(--spacing-sm) var(--spacing-lg);
    font-size: var(--font-size-small);
    font-weight: 500;
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-dim);
    cursor: pointer;
    transition: color var(--transition-fast);
    position: relative;
    z-index: 1;
    font-family: inherit;
    line-height: var(--spacing-md);
  }

  .brain-view-seg:hover {
    color: var(--text-secondary);
  }

  .brain-view-seg.active {
    color: var(--accent);
  }
`;
