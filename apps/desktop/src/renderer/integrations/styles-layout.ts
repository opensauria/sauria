import { css } from 'lit';

/* Header, category tabs, grid, and card styles */

export const layoutStyles = css`
  sauria-integrations {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: var(--bg-solid);
  }

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
    height: var(--spacing-xl);
    width: 240px;
    -webkit-app-region: no-drag;
  }

  .integrations-search svg {
    width: var(--spacing-md);
    height: var(--spacing-md);
    color: var(--text-dim);
    flex-shrink: 0;
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
    padding: var(--spacing-smd) var(--spacing-lg);
    border-bottom: 1px solid var(--border);
    -webkit-app-region: no-drag;
  }

  .category-tabs integration-category-tabs {
    display: flex;
    flex-wrap: wrap;
    column-gap: var(--spacing-sm);
    row-gap: var(--spacing-sm);
  }

  .category-tab {
    flex-shrink: 0;
    padding: var(--spacing-xs) var(--spacing-smd);
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

  /* ── Segmented Toggle ──────────────────────── */

  .integrations-toggle {
    display: flex;
    justify-content: center;
    padding: var(--spacing-sm) var(--spacing-lg);
    border-bottom: 1px solid var(--border);
  }

  .integrations-toggle .segmented-toggle {
    width: 100%;
    max-width: 400px;
  }

  .integrations-toggle .seg-btn {
    flex: 1;
    text-align: center;
  }

  /* ── Grid ────────────────────────────────────── */

  .integrations-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(224px, 1fr));
    align-content: start;
    gap: var(--spacing-md);
    padding: var(--spacing-lg);
    overflow-y: auto;
    flex: 1;
    min-height: 0;
  }

  .ch-add-card--grid {
    flex-direction: column;
    min-height: 120px;
    margin-top: 0;
    border-style: dashed;
  }

  /* ── Personal MCP Cards ──────────────────────── */

  .personal-mcp-card {
    position: relative;
  }

  .personal-mcp-card .card-footer {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
  }

  .personal-mcp-card .card-tool-count {
    font-size: var(--font-size-small);
    color: var(--text-dim);
  }

  .personal-mcp-disconnect {
    margin-left: auto;
    width: var(--spacing-lg);
    height: var(--spacing-lg);
  }

  .integrations-loading {
    grid-column: 1 / -1;
    display: flex;
    justify-content: center;
    padding-top: calc(2 * var(--spacing-xl) + var(--spacing-md));
  }

  /* ── Card overrides ────────────────────────────── */

  .integrations-grid .card-icon-img {
    width: var(--spacing-xl);
    height: var(--spacing-xl);
    flex-shrink: 0;
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

  .integrations-empty {
    grid-column: 1 / -1;
    display: flex;
    justify-content: center;
    padding-top: calc(2 * var(--spacing-xl) + var(--spacing-md));
  }

  .integrations-empty-text {
    color: var(--text-dim);
    font-size: var(--font-size-base);
  }

  .integrations-error {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-md);
    color: var(--warning);
    font-size: var(--font-size-small);
  }
`;
