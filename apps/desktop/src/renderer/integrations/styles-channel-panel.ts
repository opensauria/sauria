import { css } from 'lit';

/* Shared bot card, connect form, and status styles for channel panels (Telegram, Slack, etc.) */

export const channelPanelStyles = css`
  /* ── Bot Cards ────────────────────────────────── */

  .ch-bot-list {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }

  .ch-bot-card {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-sm);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
  }

  .ch-bot-avatar,
  .ch-bot-avatar-placeholder {
    width: calc(2 * var(--spacing-mld));
    height: calc(2 * var(--spacing-mld));
    border-radius: 50%;
    flex-shrink: 0;
    overflow: hidden;
  }

  .ch-bot-avatar {
    object-fit: cover;
  }

  .ch-bot-avatar-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    background: color-mix(in srgb, var(--accent) 12%, transparent);
  }

  .ch-bot-avatar-placeholder img {
    width: var(--spacing-mld);
    height: var(--spacing-mld);
  }

  .ch-bot-info {
    flex: 1;
    min-width: 0;
  }

  .ch-bot-name {
    font-size: var(--font-size-label);
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ch-bot-subtitle {
    font-weight: 400;
    color: var(--text-dim);
  }

  .ch-bot-status {
    font-size: var(--font-size-x-small);
    color: var(--text-dim);
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
  }

  .ch-bot-dot {
    width: var(--spacing-sm);
    height: var(--spacing-sm);
    border-radius: 50%;
    background: var(--success);
  }

  .ch-bot-disconnect {
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

  .ch-bot-disconnect:hover {
    border-color: var(--error);
    background: color-mix(in srgb, var(--error) 8%, transparent);
  }

  .ch-bot-disconnect svg {
    color: var(--text-dim);
    transition: color var(--transition-fast);
  }

  .ch-bot-disconnect:hover svg {
    color: var(--error);
  }

  .ch-add-card {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-sm);
    width: 100%;
    margin-top: var(--spacing-sm);
    padding: var(--spacing-sm);
    border: 1px dashed var(--border);
    border-radius: var(--radius-sm);
    background: none;
    color: var(--text-dim);
    font-size: var(--font-size-label);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .ch-add-card:hover {
    border-color: var(--accent);
    color: var(--accent);
  }

  .ch-add-card svg {
    color: inherit;
  }

  .ch-connect-section {
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
