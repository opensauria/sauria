import { css } from 'lit';

export const tableStyles = css`
  .data-table-wrap {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    overflow-x: hidden;
  }

  .data-table {
    width: 100%;
    border-collapse: collapse;
    flex-shrink: 0;
  }

  .data-table th {
    position: sticky;
    top: 0;
    background: var(--bg-solid);
    text-align: left;
    padding: var(--spacing-sm) var(--spacing-md);
    font-size: var(--font-size-x-small);
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--text-dim);
    border-bottom: 1px solid var(--border);
    white-space: nowrap;
    z-index: var(--z-base);
  }

  .data-table td {
    padding: var(--spacing-smd) var(--spacing-md);
    font-size: var(--font-size-label);
    border-bottom: 1px solid var(--border);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 280px;
  }

  .data-table tr {
    cursor: pointer;
    transition: background var(--transition-fast);
  }

  .data-table tbody tr:hover {
    background: var(--surface-hover);
  }

  .data-table tbody tr.selected {
    background: color-mix(in srgb, var(--accent) 8%, transparent);
  }

  .confidence-bar {
    width: var(--spacing-xxl);
    height: var(--spacing-xs);
    background: var(--surface);
    border-radius: 2px;
    overflow: hidden;
    display: inline-block;
    vertical-align: middle;
  }

  .confidence-fill {
    display: block;
    height: 100%;
    border-radius: 2px;
    background: var(--accent);
  }

  .ts {
    font-variant-numeric: tabular-nums;
    color: var(--text-dim);
  }
`;
