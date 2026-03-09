import { css } from 'lit';

export const canvasGearStyles = css`
  .card-gear {
    position: absolute;
    top: var(--spacing-sm);
    right: var(--spacing-sm);
    width: var(--spacing-lg);
    height: var(--spacing-lg);
    border-radius: 50%;
    background: var(--border);
    border: none;
    color: var(--text-dim);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.12s ease;
    padding: 0;
    z-index: 2;
    opacity: 0;
  }

  .agent-card:hover .card-gear {
    opacity: 1;
  }

  .card-gear:hover {
    background: var(--border-active);
    color: var(--text-secondary);
    transform: scale(1.1);
  }

  .card-gear svg {
    width: var(--spacing-md);
    height: var(--spacing-md);
  }

  .card-gear img {
    width: var(--spacing-md);
    height: var(--spacing-md);
    filter: brightness(0) invert(0.35);
    transition: filter 0.12s ease;
  }

  .card-gear:hover img {
    filter: brightness(0) invert(0.7);
  }
`;
