import { css } from 'lit';

export const paletteFormStyles = css`
  .form-field {
    margin-bottom: var(--spacing-smd);
  }

  .form-field label {
    display: block;
    font-size: var(--font-size-x-small);
    color: color-mix(in srgb, var(--text) 40%, transparent);
    margin-bottom: var(--spacing-xs);
  }

  .form-field input {
    width: 100%;
    padding: var(--spacing-sm) var(--spacing-smd);
    background: color-mix(in srgb, var(--text) 6%, transparent);
    border: 0.5px solid color-mix(in srgb, var(--text) 10%, transparent);
    border-radius: var(--radius-sm);
    color: var(--text);
    font-size: var(--font-size-label);
    font-family: var(--font-family-mono);
    outline: none;
    transition: border-color var(--transition-fast);
    box-sizing: border-box;
  }

  .form-field input:focus {
    border-color: color-mix(in srgb, var(--text) 25%, transparent);
  }

  .form-field input::placeholder {
    color: color-mix(in srgb, var(--text) 20%, transparent);
  }

  .form-field .field-hint {
    font-size: var(--font-size-micro);
    color: color-mix(in srgb, var(--text) 25%, transparent);
    margin-top: var(--spacing-xs);
  }

  .form-actions {
    display: flex;
    gap: var(--spacing-sm);
    margin-top: var(--spacing-smd);
  }

  .form-btn {
    padding: var(--spacing-sm) var(--spacing-md);
    border-radius: var(--radius-pill);
    font-size: var(--font-size-small);
    font-weight: 500;
    border: none;
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .form-btn-primary {
    background: var(--platform-telegram);
    color: var(--text-on-accent);
  }

  .form-btn-primary:hover {
    filter: brightness(0.9);
  }

  .form-btn-primary:disabled {
    opacity: var(--opacity-disabled);
    cursor: not-allowed;
  }

  .form-btn-cancel {
    background: color-mix(in srgb, var(--text) 6%, transparent);
    color: color-mix(in srgb, var(--text) 50%, transparent);
    border: 0.5px solid var(--border);
  }

  .form-btn-cancel:hover {
    background: color-mix(in srgb, var(--text) 10%, transparent);
  }

  .form-status {
    font-size: var(--font-size-small);
    margin-top: var(--spacing-sm);
    display: none;
  }

  .form-status.visible {
    display: block;
  }

  .form-status.error {
    color: var(--error);
  }

  .form-status.success {
    color: var(--success);
  }

  /* -- Update banner -- */

  .update-banner {
    position: fixed;
    bottom: var(--spacing-smd);
    left: var(--spacing-smd);
    right: var(--spacing-smd);
    padding: var(--spacing-smd) var(--spacing-md);
    background: var(--accent-subtle);
    border: 0.5px solid color-mix(in srgb, var(--accent) 30%, transparent);
    border-radius: var(--radius-sm);
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: var(--font-size-small);
    color: var(--text);
    opacity: 0;
    transform: translateY(var(--spacing-sm));
    transition: all var(--transition-normal);
  }

  .update-banner.visible {
    opacity: 1;
    transform: translateY(0);
  }

  .update-btn {
    padding: var(--spacing-xs) var(--spacing-smd);
    border-radius: var(--radius-pill);
    border: none;
    background: var(--accent);
    color: var(--text-on-accent);
    font-size: var(--font-size-small);
    cursor: pointer;
    transition: background 0.1s ease;
  }

  .update-btn:hover {
    background: var(--accent-hover);
  }

  .update-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;
