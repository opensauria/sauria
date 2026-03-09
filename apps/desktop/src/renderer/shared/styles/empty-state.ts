import { css } from 'lit';

export const emptyStateStyles = css`
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--spacing-xxl);
    color: var(--text-dim);
    font-size: var(--font-size-base);
    gap: var(--spacing-sm);
    flex: 1;
  }

  .empty-state img {
    width: var(--spacing-xxl);
    height: var(--spacing-xxl);
    opacity: 0.2;
    filter: brightness(0) invert();
    margin-bottom: var(--spacing-sm);
  }

  .empty-state-title {
    font-size: var(--font-size-heading);
    font-weight: 600;
    color: var(--text-secondary);
  }

  .empty-state-hint {
    font-size: var(--font-size-small);
    color: var(--text-dim);
    text-align: center;
    max-width: 320px;
    line-height: 1.5;
  }
`;
