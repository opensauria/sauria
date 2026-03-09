import { css } from 'lit';

export const formStyles = css`
  .form-group {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
  }

  .form-label {
    font-size: var(--font-size-small);
    font-weight: 500;
    color: var(--text-secondary);
  }

  .form-input {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: var(--spacing-smd) var(--spacing-sm);
    color: var(--text);
    font-size: var(--font-size-label);
    outline: none;
    transition: border-color var(--transition-fast);
    font-family: inherit;
    width: 100%;
  }

  .form-input:focus {
    border-color: var(--accent);
  }

  .form-input::placeholder {
    color: var(--text-dim);
  }

  .form-input-mono {
    font-family: var(--font-family-mono);
  }

  .form-hint {
    font-size: var(--font-size-micro);
    color: var(--text-dim);
    margin-top: var(--spacing-xs);
  }

  .form-hint a {
    color: var(--accent);
    text-decoration: none;
  }

  .form-actions {
    display: flex;
    gap: var(--spacing-sm);
    margin-top: var(--spacing-sm);
  }

  .form-status {
    font-size: var(--font-size-small);
    display: none;
    padding: var(--spacing-sm);
    border-radius: var(--radius-sm);
  }

  .form-status.visible {
    display: block;
  }

  .form-status.error {
    color: var(--error);
    background: color-mix(in srgb, var(--error) 8%, transparent);
  }

  .form-status.success {
    color: var(--success);
    background: color-mix(in srgb, var(--success) 8%, transparent);
  }

  .form-toggle {
    position: relative;
    width: calc(2 * var(--spacing-mld));
    height: var(--spacing-mld);
    background: var(--border);
    border-radius: var(--radius-pill);
    cursor: pointer;
    transition: background var(--transition-fast);
    border: none;
    padding: 0;
  }

  .form-toggle.active {
    background: var(--accent);
  }

  .form-toggle::after {
    content: '';
    position: absolute;
    top: 2px;
    left: 2px;
    width: var(--spacing-md);
    height: var(--spacing-md);
    background: var(--text-on-accent);
    border-radius: 50%;
    transition: transform var(--transition-fast);
  }

  .form-toggle.active::after {
    transform: translateX(var(--spacing-mld));
  }

  .error-msg {
    color: var(--error);
    font-size: var(--font-size-label);
    margin-top: var(--spacing-sm);
    display: none;
  }

  .error-msg.visible {
    display: block;
  }
`;
