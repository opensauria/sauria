import { css } from 'lit';

export const brainLayoutStyles = css`
  .brain-layout {
    --titlebar-h: 32px;
    display: flex;
    height: 100vh;
    overflow: hidden;
    position: relative;
  }

  .brain-sidebar {
    width: 200px;
    flex-shrink: 0;
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    padding-top: var(--titlebar-h);
    background: color-mix(in srgb, var(--text-on-accent) 2%, transparent);
  }

  .brain-sidebar-section {
    padding: 0 var(--spacing-sm);
    margin-bottom: var(--spacing-sm);
  }

  .brain-sidebar-section-label {
    font-size: var(--font-size-micro);
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-dim);
    padding: var(--spacing-sm) var(--spacing-sm) var(--spacing-xs);
  }

  .brain-nav-item {
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

  .brain-nav-item:hover {
    background: var(--surface-hover);
    color: var(--text);
  }

  .brain-nav-item.active {
    background: color-mix(in srgb, var(--accent) 12%, transparent);
    color: var(--accent);
  }

  .brain-nav-item .icon-mono {
    width: var(--spacing-md);
    height: var(--spacing-md);
    opacity: var(--opacity-muted);
    filter: brightness(0) invert();
  }

  .brain-nav-item.active .icon-mono {
    filter: brightness(0) invert() sepia(1) saturate(20) hue-rotate(160deg) brightness(0.7);
  }

  .brain-nav-count {
    margin-left: auto;
    font-size: var(--font-size-x-small);
    color: var(--text-dim);
    font-variant-numeric: tabular-nums;
  }

  .brain-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    overflow: hidden;
  }

  .brain-toolbar {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-sm) var(--spacing-md);
    padding-top: calc(var(--titlebar-h) + var(--spacing-sm));
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  .brain-search {
    flex: 1;
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: var(--spacing-sm) var(--spacing-smd);
  }

  .brain-search img {
    width: var(--spacing-md);
    height: var(--spacing-md);
    opacity: var(--opacity-disabled);
    filter: brightness(0) invert();
  }

  .brain-search input {
    flex: 1;
    background: none;
    border: none;
    color: var(--text);
    font-size: var(--font-size-label);
    outline: none;
    font-family: inherit;
  }

  .brain-search input::placeholder {
    color: var(--text-dim);
  }

  .brain-filter {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: var(--spacing-sm) var(--spacing-smd);
    color: var(--text-secondary);
    font-size: var(--font-size-label);
    cursor: pointer;
    appearance: none;
    font-family: inherit;
  }

  .brain-filter:hover {
    background: var(--surface-hover);
  }
`;
