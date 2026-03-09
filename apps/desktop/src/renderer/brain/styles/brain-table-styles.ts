import { css } from 'lit';

export const brainTableStyles = css`
  .brain-stats {
    display: flex;
    gap: var(--spacing-md);
    padding: var(--spacing-sm) var(--spacing-md);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  .brain-stat {
    display: flex;
    align-items: baseline;
    gap: var(--spacing-xs);
    font-size: var(--font-size-small);
    color: var(--text-dim);
  }

  .brain-stat-value {
    font-size: var(--font-size-base);
    font-weight: 600;
    color: var(--text);
    font-variant-numeric: tabular-nums;
  }

  .brain-table-wrap {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    overflow-x: hidden;
  }

  .brain-table {
    width: 100%;
    border-collapse: collapse;
    flex-shrink: 0;
  }

  .brain-table th {
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
    z-index: 1;
  }

  .brain-table td {
    padding: var(--spacing-smd) var(--spacing-md);
    font-size: var(--font-size-label);
    border-bottom: 1px solid var(--border);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 280px;
  }

  .brain-table tr {
    cursor: pointer;
    transition: background var(--transition-fast);
  }

  .brain-table tbody tr:hover {
    background: var(--surface-hover);
  }

  .brain-table tbody tr.selected {
    background: color-mix(in srgb, var(--accent) 8%, transparent);
  }

  .type-badge {
    display: inline-block;
    font-size: var(--font-size-x-small);
    padding: 2px var(--spacing-sm);
    border-radius: var(--radius-sm);
    font-weight: 500;
  }

  .type-person {
    color: var(--entity-person);
    background: color-mix(in srgb, var(--entity-person) 12%, transparent);
  }

  .type-project {
    color: var(--entity-project);
    background: color-mix(in srgb, var(--entity-project) 12%, transparent);
  }

  .type-company {
    color: var(--entity-company);
    background: color-mix(in srgb, var(--entity-company) 12%, transparent);
  }

  .type-event {
    color: var(--entity-event);
    background: color-mix(in srgb, var(--entity-event) 12%, transparent);
  }

  .type-document {
    color: var(--entity-document);
    background: color-mix(in srgb, var(--entity-document) 12%, transparent);
  }

  .type-goal {
    color: var(--entity-goal);
    background: color-mix(in srgb, var(--entity-goal) 12%, transparent);
  }

  .type-place {
    color: var(--entity-place);
    background: color-mix(in srgb, var(--entity-place) 12%, transparent);
  }

  .type-concept {
    color: var(--entity-concept);
    background: color-mix(in srgb, var(--entity-concept) 12%, transparent);
  }

  .type-pattern {
    color: var(--entity-company);
    background: color-mix(in srgb, var(--entity-company) 12%, transparent);
  }

  .type-insight {
    color: var(--warning);
    background: color-mix(in srgb, var(--warning) 12%, transparent);
  }

  .type-prediction {
    color: var(--entity-concept);
    background: color-mix(in srgb, var(--entity-concept) 12%, transparent);
  }

  .type-preference {
    color: var(--entity-person);
    background: color-mix(in srgb, var(--entity-person) 12%, transparent);
  }

  .type-fact {
    color: var(--success);
    background: color-mix(in srgb, var(--success) 12%, transparent);
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
