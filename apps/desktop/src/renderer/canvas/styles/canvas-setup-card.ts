import { css } from 'lit';

export const canvasSetupCardStyles = css`
  .agent-card.setup,
  .agent-card.connecting,
  .agent-card.error-state {
    width: 280px;
    padding: var(--spacing-mld);
    border-radius: var(--radius-lg);
    align-items: stretch;
  }

  .agent-card.error-state {
    border-color: color-mix(in srgb, var(--error) 30%, transparent);
  }

  .card-setup-header {
    display: flex;
    align-items: center;
    gap: var(--spacing-smd);
    margin-bottom: var(--spacing-md);
  }

  .card-setup-header .cf-icon {
    width: var(--spacing-xl);
    height: var(--spacing-xl);
    flex-shrink: 0;
  }

  .card-setup-header .cf-icon svg,
  .card-setup-header .cf-icon img {
    width: 28px;
    height: 28px;
  }

  .card-setup-header .card-setup-title {
    font-size: var(--font-size-base);
    font-weight: 600;
    color: var(--text);
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .card-setup-close {
    flex-shrink: 0;
    width: var(--spacing-lg);
    height: var(--spacing-lg);
    border-radius: var(--radius-sm);
    border: none;
    background: transparent;
    color: var(--text-dim);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: var(--font-size-heading);
    line-height: 1;
    transition: all 0.12s ease;
    padding: 0;
  }

  .card-setup-close:hover {
    background: var(--border);
    color: var(--text-secondary);
  }

  .card-setup-field {
    margin-bottom: var(--spacing-smd);
  }

  .card-setup-field label {
    display: block;
    font-size: var(--font-size-x-small);
    font-weight: 500;
    color: var(--text-dim);
    margin-bottom: var(--spacing-xs);
  }

  .card-setup-field input {
    width: 100%;
    padding: var(--spacing-sm) var(--spacing-smd);
    background: var(--surface-light);
    border: 1px solid var(--border-hover);
    border-radius: var(--radius-sm);
    color: var(--text);
    font-size: var(--font-size-small);
    font-family: var(--font-family-mono);
    outline: none;
    transition: border-color var(--transition-fast);
    box-sizing: border-box;
  }

  .card-setup-field input:focus {
    border-color: var(--border-active);
  }

  .card-setup-field input::placeholder {
    color: var(--text-dim);
  }

  .card-setup-field input:disabled {
    opacity: var(--opacity-disabled);
    cursor: not-allowed;
  }

  .card-setup-field .card-field-hint {
    font-size: var(--font-size-micro);
    color: var(--text-dim);
    margin-top: 2px;
  }

  .card-setup-actions {
    display: flex;
    gap: var(--spacing-sm);
    margin-top: var(--spacing-md);
  }

  .card-setup-actions button {
    padding: var(--spacing-sm) var(--spacing-md);
    border-radius: var(--radius-pill);
    font-size: var(--font-size-small);
    font-weight: 500;
    border: none;
    cursor: pointer;
    transition: all var(--transition-fast);
    flex: 1;
  }

  .card-setup-actions .btn-connect {
    background: var(--accent);
    color: var(--text-on-accent);
  }

  .card-setup-actions .btn-connect:hover {
    background: var(--accent-hover);
  }

  .card-setup-actions .btn-connect:disabled {
    opacity: var(--opacity-disabled);
    cursor: not-allowed;
  }

  .card-setup-actions .btn-cancel {
    background: var(--surface-light);
    color: var(--text-secondary);
    border: 1px solid var(--border);
  }

  .card-setup-actions .btn-cancel:hover {
    background: var(--surface-hover);
  }

  .card-setup-status {
    font-size: var(--font-size-x-small);
    margin-top: var(--spacing-sm);
    min-height: var(--spacing-md);
    display: flex;
    align-items: center;
  }

  .card-setup-status.error {
    color: var(--error);
  }

  .card-setup-status.success {
    color: var(--success);
  }

  .card-setup-status.info {
    color: var(--text-dim);
  }

  .card-spinner {
    display: inline-block;
    width: var(--spacing-md);
    height: var(--spacing-md);
    border: 2px solid var(--border-hover);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: cardSpin 0.6s linear infinite;
    vertical-align: middle;
    margin-right: var(--spacing-sm);
  }

  @keyframes cardSpin {
    to {
      transform: rotate(360deg);
    }
  }
`;
