import { css } from 'lit';

export const navStyles = css`
  .sidebar {
    flex-shrink: 0;
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    background: color-mix(in srgb, var(--text-on-accent) 2%, transparent);
  }

  .sidebar-section {
    padding: 0 var(--spacing-sm);
    margin-bottom: var(--spacing-sm);
  }

  .sidebar-section-label {
    font-size: var(--font-size-micro);
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-dim);
    padding: var(--spacing-sm) var(--spacing-sm) var(--spacing-xs);
  }

  .nav-item {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-sm);
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-size: var(--font-size-label);
    color: var(--text-secondary);
    transition: all var(--transition-fast);
  }

  .nav-item:hover {
    background: var(--surface-hover);
    color: var(--text);
  }

  .nav-item.active {
    background: color-mix(in srgb, var(--accent) 12%, transparent);
    color: var(--accent);
  }

  .nav-item .icon-mono {
    width: var(--spacing-md);
    height: var(--spacing-md);
    opacity: var(--opacity-muted);
    filter: brightness(0) invert();
  }

  .nav-item.active .icon-mono {
    filter: brightness(0) invert() sepia(1) saturate(20) hue-rotate(160deg) brightness(0.7);
    opacity: 1;
  }

  .nav-count {
    margin-left: auto;
    font-size: var(--font-size-x-small);
    color: var(--text-dim);
    font-variant-numeric: tabular-nums;
  }
`;
