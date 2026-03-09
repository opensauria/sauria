import { css } from 'lit';

export const agentIntegrationsStyles = css`
  :host {
    display: block;
  }
  .section {
    margin-bottom: var(--spacing-md);
  }
  .label {
    display: block;
    font-size: var(--font-size-small);
    color: var(--text-secondary);
    margin-bottom: var(--spacing-xs);
  }
  .int-chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-xs);
    margin-bottom: var(--spacing-sm);
  }
  .int-chip {
    display: inline-flex;
    align-items: center;
    gap: var(--spacing-xs);
    padding: var(--spacing-xs) var(--spacing-sm);
    background: var(--surface);
    border-radius: var(--radius-sm);
    font-size: var(--font-size-small);
    color: var(--text-secondary);
  }
  .int-chip img {
    width: var(--spacing-md);
    height: var(--spacing-md);
  }
  .int-chip-remove {
    background: none;
    border: none;
    color: var(--text-dim);
    cursor: pointer;
    padding: 0;
  }
  .add-int-btn {
    background: var(--surface);
    border: 1px dashed var(--border);
    border-radius: var(--radius-sm);
    padding: var(--spacing-xs) var(--spacing-smd);
    color: var(--text-secondary);
    font-size: var(--font-size-small);
    cursor: pointer;
  }
  .add-int-btn:hover {
    border-color: var(--accent);
    color: var(--accent);
  }
  input {
    width: 100%;
    box-sizing: border-box;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: var(--spacing-sm) var(--spacing-smd);
    color: var(--text);
    font-size: var(--font-size-base);
    outline: none;
  }
  input:focus {
    border-color: var(--accent);
  }
  .int-dropdown {
    margin-top: var(--spacing-xs);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    max-height: 160px;
    overflow-y: auto;
    padding: var(--spacing-xs);
  }
  .int-dropdown-search {
    margin-bottom: var(--spacing-xs);
  }
  .int-dropdown-empty {
    padding: var(--spacing-sm);
    font-size: var(--font-size-small);
    color: var(--text-dim);
  }
  .int-dropdown-item {
    padding: var(--spacing-xs) var(--spacing-sm);
    cursor: pointer;
    font-size: var(--font-size-small);
    color: var(--text-secondary);
    border-radius: var(--radius-sm);
  }
`;
