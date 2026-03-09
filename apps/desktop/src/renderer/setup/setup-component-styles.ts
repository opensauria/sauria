import { css } from 'lit';

export const setupComponentStyles = css`
  /* Progress */

  .progress-list {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
    flex: 1;
  }

  .progress-item {
    display: flex;
    align-items: center;
    gap: var(--spacing-smd);
    font-size: var(--font-size-base);
    color: var(--text-secondary);
  }

  .progress-item.done {
    color: var(--text);
  }

  .progress-dot {
    width: var(--spacing-lg);
    height: var(--spacing-lg);
    border-radius: 50%;
    border: 2px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    font-size: var(--font-size-small);
    transition: all var(--transition-normal);
  }

  .progress-item.done .progress-dot {
    background: var(--success);
    border-color: var(--success);
    color: var(--text-on-accent);
  }

  .progress-item.active .progress-dot {
    border-color: var(--accent);
  }

  /* Success */

  .success-icon {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    background: color-mix(in srgb, var(--success) 12%, transparent);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 32px;
    margin-bottom: var(--spacing-lg);
  }

  .client-list {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
    margin-top: var(--spacing-md);
  }

  .client-list li {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    font-size: var(--font-size-base);
    color: var(--text-secondary);
    padding: var(--spacing-sm) var(--spacing-smd);
    background: var(--surface);
    border-radius: var(--radius-sm);
  }

  .client-list li .check {
    color: var(--success);
  }

  /* OAuth */

  .oauth-url-box {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: var(--spacing-md);
    margin-bottom: var(--spacing-lg);
    word-break: break-all;
    font-family: var(--font-family-mono);
    font-size: var(--font-size-small);
    color: var(--text-dim);
    line-height: 1.6;
    max-height: 80px;
    overflow-y: auto;
  }

  .oauth-steps {
    color: var(--text-secondary);
    font-size: var(--font-size-label);
    margin-top: var(--spacing-sm);
    line-height: 1.6;
  }

  /* Scan status */

  .scan-status {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-md);
    flex: 1;
    color: var(--text-secondary);
    font-size: var(--font-size-base);
  }
`;
