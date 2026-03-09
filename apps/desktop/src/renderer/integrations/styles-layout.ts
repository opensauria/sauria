import { css } from 'lit';

/* Header, category tabs, grid, and card styles */

export const layoutStyles = css`
  /* ── Header ──────────────────────────────────── */

  .integrations-header {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-md) var(--spacing-lg);
    border-bottom: 1px solid var(--border);
    -webkit-app-region: drag;
  }

  .integrations-header .palette-back {
    position: static;
    display: flex;
    z-index: auto;
    -webkit-app-region: no-drag;
  }

  .integrations-title {
    font-size: var(--font-size-heading);
    font-weight: 600;
    white-space: nowrap;
    -webkit-app-region: no-drag;
  }

  .integrations-search {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    margin-left: auto;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 0 var(--spacing-sm);
    height: 32px;
    width: 240px;
    -webkit-app-region: no-drag;
  }

  .integrations-search img {
    width: 16px;
    height: 16px;
    opacity: 0.5;
    filter: brightness(0) invert();
  }

  .integrations-search input {
    background: none;
    border: none;
    outline: none;
    color: var(--text);
    font-size: var(--font-size-label);
    width: 100%;
  }

  .integrations-search input::placeholder {
    color: var(--text-dim);
  }

  /* ── Category Tabs ──────────────────────────── */

  .category-tabs {
    display: flex;
    gap: var(--spacing-sm);
    padding: var(--spacing-sm) var(--spacing-lg);
    overflow-x: auto;
    scrollbar-width: none;
    border-bottom: 1px solid var(--border);
    -webkit-app-region: no-drag;
  }

  .category-tabs::-webkit-scrollbar {
    display: none;
  }

  .category-tab {
    flex-shrink: 0;
    padding: var(--spacing-xs) var(--spacing-sm);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: none;
    color: var(--text-dim);
    font-size: var(--font-size-small);
    cursor: pointer;
    transition: all var(--transition-fast);
    white-space: nowrap;
  }

  .category-tab:hover {
    border-color: var(--border-active);
    color: var(--text-secondary);
  }

  .category-tab.active {
    border-color: var(--accent);
    color: var(--accent);
    background: color-mix(in srgb, var(--accent) 8%, transparent);
  }

  /* ── Grid ────────────────────────────────────── */

  .integrations-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    align-content: start;
    gap: var(--spacing-md);
    padding: var(--spacing-lg);
    overflow-y: auto;
    height: calc(100vh - 112px);
  }

  .integrations-loading {
    grid-column: 1 / -1;
    display: flex;
    justify-content: center;
    padding-top: 80px;
  }

  /* ── Card ────────────────────────────────────── */

  .integration-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: var(--spacing-lg);
    cursor: pointer;
    transition: all var(--transition-fast);
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
    animation: fadeIn var(--transition-normal);
  }

  .integration-card:hover {
    border-color: var(--border-active);
    background: var(--surface-hover);
  }

  .integration-card.connected {
    border-color: color-mix(in srgb, var(--accent) 30%, transparent);
  }

  .integration-card-header {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
  }

  .integration-card-icon {
    width: 32px;
    height: 32px;
    flex-shrink: 0;
  }

  .integration-card-name {
    font-size: var(--font-size-base);
    font-weight: 600;
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .integration-card-description {
    font-size: var(--font-size-small);
    color: var(--text-secondary);
    line-height: 1.4;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .integration-card-footer {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
  }

  .integration-card-footer .badge {
    margin-left: 0;
  }

  .integration-card-category {
    font-size: var(--font-size-x-small);
    color: var(--text-dim);
    text-transform: capitalize;
  }

  /* ── Responsive ──────────────────────────────── */

  @media (max-width: 560px) {
    .integrations-header {
      padding-left: var(--spacing-xxl);
      gap: var(--spacing-sm);
    }

    .integrations-search {
      width: 160px;
    }
  }
`;
