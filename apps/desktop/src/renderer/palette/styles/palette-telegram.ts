import { css } from 'lit';

export const paletteTelegramStyles = css`
  /* -- Telegram panel -- */

  .telegram-form {
    display: none;
    border-top: 0.5px solid var(--border);
    padding: var(--spacing-smd);
    background: color-mix(in srgb, var(--bg-solid) 12%, transparent);
    animation: fadeIn var(--transition-fast);
    flex: 1;
    overflow-y: auto;
  }

  .telegram-form.visible {
    display: flex;
    flex-direction: column;
  }

  .tg-section-title {
    font-size: var(--font-size-micro);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    color: color-mix(in srgb, var(--text) 30%, transparent);
    margin-bottom: var(--spacing-sm);
    padding: 0 var(--spacing-xs);
  }

  /* -- Bot card -- */

  .bot-card {
    display: flex;
    align-items: center;
    gap: var(--spacing-smd);
    padding: var(--spacing-smd);
    background: var(--surface);
    border: 0.5px solid var(--border);
    border-radius: var(--radius);
    margin-bottom: var(--spacing-sm);
    transition: background var(--transition-fast);
  }

  .bot-card:hover {
    background: var(--surface-light);
  }

  .bot-avatar {
    width: 40px;
    height: 40px;
    border-radius: var(--radius);
    background: var(--surface-light);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    overflow: hidden;
  }

  .bot-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: var(--radius);
  }

  .bot-avatar svg {
    width: var(--spacing-mld);
    height: var(--spacing-mld);
  }

  .bot-info {
    flex: 1;
    min-width: 0;
  }

  .bot-name {
    font-size: var(--font-size-label);
    font-weight: 500;
    color: color-mix(in srgb, var(--text) 90%, transparent);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .bot-meta {
    font-size: var(--font-size-x-small);
    color: color-mix(in srgb, var(--text) 35%, transparent);
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    margin-top: 2px;
  }

  .bot-status-dot {
    width: var(--spacing-sm);
    height: var(--spacing-sm);
    border-radius: 50%;
    background: var(--success);
    flex-shrink: 0;
  }

  .bot-status-dot.offline {
    background: color-mix(in srgb, var(--text) 20%, transparent);
  }

  .bot-actions {
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }

  .bot-action-btn {
    width: 28px;
    height: 28px;
    border-radius: var(--radius-sm);
    border: none;
    background: transparent;
    color: color-mix(in srgb, var(--text) 30%, transparent);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all var(--transition-fast);
  }

  .bot-action-btn:hover {
    background: var(--border);
    color: color-mix(in srgb, var(--text) 60%, transparent);
  }

  .bot-action-btn.danger:hover {
    background: color-mix(in srgb, var(--error) 12%, transparent);
    color: var(--error);
  }

  .bot-action-btn svg {
    width: var(--spacing-md);
    height: var(--spacing-md);
  }

  /* -- Add bot button -- */

  .add-bot-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-smd);
    background: transparent;
    border: 1.5px dashed var(--border);
    border-radius: var(--radius);
    color: color-mix(in srgb, var(--text) 25%, transparent);
    font-size: var(--font-size-small);
    font-weight: 500;
    cursor: pointer;
    transition: all var(--transition-fast);
    width: 100%;
    margin-top: var(--spacing-xs);
  }

  .add-bot-btn:hover {
    border-color: color-mix(in srgb, var(--platform-telegram) 30%, transparent);
    color: color-mix(in srgb, var(--platform-telegram) 70%, transparent);
    background: color-mix(in srgb, var(--platform-telegram) 4%, transparent);
  }

  .add-bot-btn svg {
    width: var(--spacing-md);
    height: var(--spacing-md);
  }

  /* -- Connect form -- */

  .tg-connect-form {
    display: none;
    margin-top: var(--spacing-sm);
  }

  .tg-connect-form.visible {
    display: block;
    animation: fadeIn var(--transition-fast);
  }
`;
