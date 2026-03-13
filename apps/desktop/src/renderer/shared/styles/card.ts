import { css } from 'lit';

export const cardStyles = css`
  .card {
    display: flex;
    align-items: center;
    gap: var(--spacing-md);
    padding: var(--spacing-md);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    cursor: pointer;
    transition: all var(--transition-fast);
    animation: fadeIn var(--transition-normal);
  }

  .card-vertical {
    flex-direction: column;
    align-items: stretch;
    gap: var(--spacing-sm);
    padding: var(--spacing-lg);
  }

  .card:hover {
    background: var(--surface-hover);
    border-color: var(--border-active);
  }

  .card.selected {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 8%, transparent);
  }

  .card.connected {
    border-color: color-mix(in srgb, var(--accent) 30%, transparent);
  }

  .card-icon {
    width: calc(2 * var(--spacing-mld));
    height: calc(2 * var(--spacing-mld));
    border-radius: var(--radius-sm);
    background: var(--border);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .card-icon img {
    width: var(--spacing-mld);
    height: var(--spacing-mld);
    filter: brightness(0) invert();
  }

  .card-icon .icon-mono {
    width: var(--spacing-mld);
    height: var(--spacing-mld);
    filter: brightness(0) invert();
    opacity: var(--opacity-muted);
  }

  .card-header {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
  }

  .card-name {
    font-size: var(--font-size-base);
    font-weight: 600;
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .card-description {
    font-size: var(--font-size-small);
    color: var(--text-secondary);
    line-height: 1.4;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .card-footer {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    flex-wrap: wrap;
  }

  .card-info h3 {
    font-size: var(--font-size-base);
    font-weight: 500;
    margin-bottom: 2px;
  }

  .card-info span {
    font-size: var(--font-size-label);
    color: var(--text-secondary);
  }

  .card-category {
    font-size: var(--font-size-x-small);
    color: var(--text-dim);
    text-transform: capitalize;
  }
`;
