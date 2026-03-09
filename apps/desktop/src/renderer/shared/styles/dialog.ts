import { css } from 'lit';

export const dialogStyles = css`
  .dialog-overlay {
    position: fixed;
    inset: 0;
    background: var(--overlay);
    display: none;
    align-items: center;
    justify-content: center;
    z-index: var(--z-modal);
  }

  .dialog-overlay.visible {
    display: flex;
  }

  .dialog {
    background: var(--bg-solid);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: var(--spacing-lg);
    width: 360px;
    max-width: 90vw;
  }

  .dialog-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--spacing-sm);
  }

  .dialog-close {
    flex-shrink: 0;
  }

  .dialog-title {
    font-size: var(--font-size-heading);
    font-weight: 600;
  }

  .dialog-text {
    font-size: var(--font-size-label);
    color: var(--text-secondary);
    line-height: 1.5;
    margin-bottom: var(--spacing-md);
  }

  .dialog-name {
    color: var(--text);
    font-weight: 500;
  }

  .dialog-warning {
    color: var(--error);
    font-size: var(--font-size-small);
    margin-bottom: var(--spacing-md);
  }

  .dialog-actions {
    display: flex;
    gap: var(--spacing-sm);
    justify-content: flex-end;
  }

  .dialog-actions .btn {
    padding: var(--spacing-sm) var(--spacing-md);
    font-size: var(--font-size-label);
  }
`;
