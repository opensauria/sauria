import { css } from 'lit';

/* Telegram bot cards and form status styles */

export const telegramStyles = css`
  /* ── Telegram Bot Cards ─────────────────────── */

  .tg-bot-list {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }

  .tg-bot-card {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-sm);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
  }

  .tg-bot-avatar,
  .tg-bot-avatar-placeholder {
    width: calc(2 * var(--spacing-mld));
    height: calc(2 * var(--spacing-mld));
    border-radius: 50%;
    flex-shrink: 0;
    overflow: hidden;
  }

  .tg-bot-avatar {
    object-fit: cover;
  }

  .tg-bot-avatar-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    background: color-mix(in srgb, var(--accent) 12%, transparent);
  }

  .tg-bot-avatar-placeholder img {
    width: var(--spacing-mld);
    height: var(--spacing-mld);
  }

  .tg-bot-info {
    flex: 1;
    min-width: 0;
  }

  .tg-bot-name {
    font-size: var(--font-size-label);
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tg-bot-status {
    font-size: var(--font-size-x-small);
    color: var(--text-dim);
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
  }

  .tg-bot-dot {
    width: var(--spacing-sm);
    height: var(--spacing-sm);
    border-radius: 50%;
    background: var(--success);
  }

  .tg-bot-disconnect {
    width: var(--spacing-xl);
    height: var(--spacing-xl);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    transition: all var(--transition-fast);
  }

  .tg-bot-disconnect:hover {
    border-color: var(--error);
    background: color-mix(in srgb, var(--error) 8%, transparent);
  }

  .tg-bot-disconnect svg {
    color: var(--text-dim);
    transition: color var(--transition-fast);
  }

  .tg-bot-disconnect:hover svg {
    color: var(--error);
  }

  .tg-add-card {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-sm);
    width: 100%;
    padding: var(--spacing-sm);
    border: 1px dashed var(--border);
    border-radius: var(--radius-sm);
    background: none;
    color: var(--text-dim);
    font-size: var(--font-size-label);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .tg-add-card:hover {
    border-color: var(--accent);
    color: var(--accent);
  }

  .tg-add-card svg {
    color: inherit;
  }

  .tg-connect-section {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
  }

  /* ── Form Status ─────────────────────────────── */

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
`;
