import { css } from 'lit';

export const spinnerStyles = css`
  .spinner {
    width: var(--spacing-lg);
    height: var(--spacing-lg);
    border: 2px solid var(--border);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    flex-shrink: 0;
  }

  .spinner-sm {
    width: var(--spacing-md);
    height: var(--spacing-md);
  }

  .spinner-inline {
    display: inline-block;
    width: var(--spacing-smd);
    height: var(--spacing-smd);
    border: 2px solid color-mix(in srgb, var(--text-on-accent) 15%, transparent);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
    vertical-align: middle;
  }
`;
