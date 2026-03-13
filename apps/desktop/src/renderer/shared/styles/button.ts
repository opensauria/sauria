import { css } from 'lit';

export const buttonStyles = css`
  .btn {
    padding: var(--spacing-smd) var(--spacing-lg);
    border-radius: var(--radius-pill);
    font-size: var(--font-size-base);
    font-weight: 500;
    border: none;
    cursor: pointer;
    transition: all var(--transition-fast);
    font-family: inherit;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-sm);
    line-height: 1;
  }

  .btn:focus {
    outline: none;
  }

  .btn:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .btn-primary {
    background: var(--accent);
    color: var(--text-on-accent);
  }

  .btn-primary:hover {
    background: var(--accent-hover);
  }

  .btn-primary:disabled {
    opacity: var(--opacity-disabled);
    cursor: not-allowed;
  }

  .btn-secondary {
    background: var(--surface);
    color: var(--text-secondary);
    border: 1px solid var(--border);
  }

  .btn-secondary:hover {
    background: var(--surface-hover);
    color: var(--text);
  }

  .btn-danger {
    background: color-mix(in srgb, var(--error) 12%, transparent);
    color: var(--error);
    border: 1px solid color-mix(in srgb, var(--error) 20%, transparent);
  }

  .btn-danger:hover {
    background: color-mix(in srgb, var(--error) 20%, transparent);
  }

  .btn-icon {
    width: var(--spacing-xl);
    height: var(--spacing-xl);
    padding: 0;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
    background: var(--bg-solid);
    color: var(--text-secondary);
    font-size: var(--font-size-heading);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: all var(--transition-fast);
    line-height: 0;
  }

  .btn-icon:hover {
    background: var(--surface-hover);
    color: var(--text);
  }

  .btn-icon img {
    width: var(--spacing-md);
    height: var(--spacing-md);
    filter: brightness(0) invert();
    opacity: var(--opacity-muted);
  }
`;
