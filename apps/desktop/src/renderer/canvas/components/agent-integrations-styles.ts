import { css } from 'lit';

export const agentIntegrationsStyles = css`
  .int-section {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }
  .int-label {
    font-size: var(--font-size-small);
    font-weight: 500;
    color: var(--text-dim);
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  /* --- Assigned integration chips --- */
  .int-chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-sm);
  }
  .int-chip {
    display: inline-flex;
    align-items: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-sm) var(--spacing-smd);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    font-size: var(--font-size-base);
    color: var(--text);
    transition: border-color var(--transition-fast);
  }
  .int-chip:hover {
    border-color: var(--border-active);
  }
  .int-chip img {
    width: var(--spacing-mld);
    height: var(--spacing-mld);
    flex-shrink: 0;
  }
  .int-chip-remove {
    background: none;
    border: none;
    color: var(--text-dim);
    cursor: pointer;
    padding: 0;
    display: flex;
    align-items: center;
    border-radius: var(--radius-sm);
    transition: color var(--transition-fast);
  }
  .int-chip-remove:hover {
    color: var(--error);
  }
  .int-chip-remove-icon {
    width: var(--spacing-smd);
    height: var(--spacing-smd);
    filter: brightness(0) invert(0.4);
    transition: filter var(--transition-fast);
  }
  .int-chip-remove:hover .int-chip-remove-icon {
    filter: brightness(0) invert(0) sepia(1) saturate(20) hue-rotate(0deg);
  }

  /* --- Add button --- */
  .add-int-btn {
    align-self: flex-start;
    background: var(--surface);
    border: 1px dashed var(--border-active);
    border-radius: var(--radius-sm);
    padding: var(--spacing-sm) var(--spacing-md);
    color: var(--text-secondary);
    font-size: var(--font-size-small);
    font-weight: 500;
    cursor: pointer;
    transition: all var(--transition-fast);
  }
  .add-int-btn:hover {
    border-color: var(--accent);
    color: var(--accent);
    background: var(--accent-subtle);
  }

  /* --- Dropdown --- */
  .int-dropdown {
    margin-top: var(--spacing-xs);
    background: var(--bg-solid);
    border: 1px solid var(--border-active);
    border-radius: var(--radius);
    max-height: 240px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
  }
  .int-dropdown-list {
    flex: 1;
    overflow-y: auto;
    padding: var(--spacing-sm);
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .int-dropdown-search-wrap {
    position: relative;
    display: flex;
    align-items: center;
    padding: var(--spacing-sm);
    border-top: 1px solid var(--border);
    flex-shrink: 0;
  }
  .int-search-icon {
    position: absolute;
    left: var(--spacing-md);
    width: var(--spacing-md);
    height: var(--spacing-md);
    filter: brightness(0) invert(0.4);
    pointer-events: none;
    flex-shrink: 0;
  }
  agent-integrations-section .int-dropdown-search {
    width: 100%;
    box-sizing: border-box;
    background: transparent;
    border: none;
    padding: var(--spacing-sm) var(--spacing-sm) var(--spacing-sm) var(--spacing-xl);
    color: var(--text);
    font-size: var(--font-size-base);
    font-family: inherit;
    outline: none;
  }
  agent-integrations-section .int-dropdown-search::placeholder {
    color: var(--text-dim);
  }
  .int-dropdown-empty {
    padding: var(--spacing-md);
    font-size: var(--font-size-base);
    color: var(--text-dim);
    text-align: center;
  }
  .int-dropdown-item {
    display: flex;
    align-items: center;
    gap: var(--spacing-smd);
    padding: var(--spacing-sm) var(--spacing-smd);
    cursor: pointer;
    font-size: var(--font-size-base);
    color: var(--text);
    border-radius: var(--radius-sm);
    transition: background var(--transition-fast);
  }
  .int-dropdown-item:hover {
    background: var(--surface-hover);
  }
  .int-dropdown-item img {
    width: var(--spacing-mld);
    height: var(--spacing-mld);
    flex-shrink: 0;
  }
  .int-dropdown-item-placeholder {
    width: var(--spacing-mld);
    height: var(--spacing-mld);
    border-radius: var(--radius-sm);
    background: var(--surface);
    flex-shrink: 0;
  }
`;
