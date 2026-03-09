import { css } from 'lit';

export const brainDetailContentStyles = css`
  .brain-relation-item {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-sm);
    border-radius: var(--radius-sm);
    font-size: var(--font-size-small);
    color: var(--text-secondary);
    cursor: pointer;
    transition: background var(--transition-fast);
  }

  .brain-relation-item:hover {
    background: var(--surface-hover);
  }

  .brain-relation-type {
    color: var(--text-dim);
    font-style: italic;
  }

  .brain-relation-name {
    color: var(--accent);
    font-weight: 500;
  }

  .brain-event-item {
    display: flex;
    gap: var(--spacing-sm);
    padding: var(--spacing-sm) 0;
    border-bottom: 1px solid var(--border);
    font-size: var(--font-size-small);
  }

  .brain-event-item:last-child {
    border-bottom: none;
  }

  .brain-event-time {
    color: var(--text-dim);
    white-space: nowrap;
    flex-shrink: 0;
    font-variant-numeric: tabular-nums;
  }

  .brain-event-text {
    color: var(--text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .brain-message {
    padding: var(--spacing-sm) 0;
    border-bottom: 1px solid var(--border);
  }

  .brain-message:last-child {
    border-bottom: none;
  }

  .brain-message-header {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    margin-bottom: var(--spacing-xs);
  }

  .brain-message-sender {
    font-size: var(--font-size-small);
    font-weight: 600;
    color: var(--accent);
  }

  .brain-message-sender.is-ceo {
    color: var(--success);
  }

  .brain-message-time {
    font-size: var(--font-size-x-small);
    color: var(--text-dim);
    margin-left: auto;
    font-variant-numeric: tabular-nums;
  }

  .brain-message-content {
    font-size: var(--font-size-label);
    color: var(--text);
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-word;
    user-select: text;
  }
`;
