import { css } from 'lit';

export const brainDialogStyles = css`
  .btn-danger {
    background: color-mix(in srgb, var(--error) 12%, transparent);
    color: var(--error);
    border: 1px solid color-mix(in srgb, var(--error) 20%, transparent);
    width: 100%;
  }

  .btn-danger:hover {
    background: color-mix(in srgb, var(--error) 20%, transparent);
  }

  .brain-dialog-overlay {
    position: fixed;
    inset: 0;
    background: var(--overlay);
    display: none;
    align-items: center;
    justify-content: center;
    z-index: 100;
  }

  .brain-dialog-overlay.visible {
    display: flex;
  }

  .brain-dialog {
    background: var(--bg-solid);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: var(--spacing-lg);
    width: 360px;
    max-width: 90vw;
  }

  .brain-dialog-title {
    font-size: var(--font-size-heading);
    font-weight: 600;
    margin-bottom: var(--spacing-sm);
  }

  .brain-dialog-text {
    font-size: var(--font-size-label);
    color: var(--text-secondary);
    line-height: 1.5;
    margin-bottom: var(--spacing-md);
  }

  .brain-dialog-name {
    color: var(--text);
    font-weight: 500;
  }

  .brain-dialog-warning {
    color: var(--error);
    font-size: var(--font-size-small);
    margin-bottom: var(--spacing-md);
  }

  .brain-dialog-actions {
    display: flex;
    gap: var(--spacing-sm);
  }

  .brain-dialog-actions .btn {
    padding: var(--spacing-sm) var(--spacing-md);
    font-size: var(--font-size-label);
  }

  .brain-empty {
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

  .brain-empty img {
    width: var(--spacing-xxl);
    height: var(--spacing-xxl);
    opacity: 0.2;
    filter: brightness(0) invert();
    margin-bottom: var(--spacing-sm);
  }

  .brain-load-more {
    padding: var(--spacing-md);
    text-align: center;
  }

  .brain-load-more button {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: var(--spacing-sm) var(--spacing-lg);
    color: var(--text-secondary);
    font-size: var(--font-size-label);
    cursor: pointer;
    transition: all var(--transition-fast);
    font-family: inherit;
  }

  .brain-load-more button:hover {
    background: var(--surface-hover);
    color: var(--text);
  }
`;
