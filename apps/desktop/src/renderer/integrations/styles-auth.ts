import { css } from 'lit';

export const authStyles = css`
  .oauth-connect-section {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-smd);
  }

  .oauth-description {
    font-size: var(--font-size-small);
    color: var(--text-secondary);
    margin: 0;
    line-height: 1.5;
  }

  .oauth-connect-section .btn svg {
    margin-right: var(--spacing-sm);
    vertical-align: middle;
  }

  .auth-toggle {
    display: flex;
    gap: 0;
    background: var(--surface);
    border-radius: var(--radius-sm);
    padding: 2px;
    margin-bottom: var(--spacing-smd);
  }

  .auth-toggle-btn {
    flex: 1;
    padding: var(--spacing-sm) var(--spacing-smd);
    border: none;
    background: transparent;
    color: var(--text-secondary);
    font-size: var(--font-size-small);
    font-weight: 500;
    border-radius: calc(var(--radius-sm) - 2px);
    cursor: pointer;
    transition: var(--transition-fast);
  }

  .auth-toggle-btn:hover {
    color: var(--text);
  }

  .auth-toggle-btn.active {
    background: color-mix(in srgb, var(--accent) 12%, transparent);
    color: var(--accent);
  }

  .config-tools {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
  }

  .config-tools-title {
    font-size: var(--font-size-small);
    font-weight: 500;
    color: var(--text-secondary);
    margin-bottom: var(--spacing-xs);
  }

  .config-tool-item {
    font-size: var(--font-size-small);
    color: var(--text-dim);
    padding: var(--spacing-xs) 0;
  }
`;
