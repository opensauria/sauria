import { css } from 'lit';

export const searchStyles = css`
  .search-bar {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: var(--spacing-sm) var(--spacing-smd);
    transition: border-color var(--transition-fast);
  }

  .search-bar:focus-within:has(input:focus-visible) {
    border-color: var(--accent);
  }

  .search-bar img {
    width: var(--spacing-md);
    height: var(--spacing-md);
    opacity: var(--opacity-disabled);
    filter: brightness(0) invert();
    flex-shrink: 0;
  }

  .search-bar input {
    flex: 1;
    background: none;
    border: none;
    color: var(--text);
    font-size: var(--font-size-label);
    outline: none;
    font-family: inherit;
  }

  .search-bar input::placeholder {
    color: var(--text-dim);
  }

  .search-filter {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: var(--spacing-sm) var(--spacing-smd);
    color: var(--text-secondary);
    font-size: var(--font-size-label);
    cursor: pointer;
    appearance: none;
    font-family: inherit;
    transition: background var(--transition-fast);
  }

  .search-filter:hover {
    background: var(--surface-hover);
  }
`;
