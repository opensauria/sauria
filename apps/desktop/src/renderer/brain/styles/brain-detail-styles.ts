import { css } from 'lit';

export const brainDetailStyles = css`
  .brain-detail {
    position: absolute;
    right: 0;
    top: 0;
    bottom: 0;
    width: 400px;
    border-left: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--bg-solid);
    transform: translateX(100%);
    transition: transform var(--transition-normal);
    z-index: var(--z-dropdown);
  }

  .brain-detail.open {
    transform: translateX(0);
  }

  .brain-detail-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--spacing-smd) var(--spacing-md);
    padding-top: calc(var(--titlebar-h) + var(--spacing-smd));
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  .brain-detail-title {
    font-size: var(--font-size-base);
    font-weight: 600;
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .brain-detail-close {
    width: var(--spacing-xl);
    height: var(--spacing-xl);
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: background var(--transition-fast);
    flex-shrink: 0;
  }

  .brain-detail-close:hover {
    background: var(--surface-hover);
  }

  .brain-detail-close img {
    width: var(--spacing-md);
    height: var(--spacing-md);
    filter: brightness(0) invert();
    opacity: var(--opacity-muted);
  }

  .brain-detail-body {
    flex: 1;
    overflow-y: auto;
    padding: var(--spacing-md);
  }

  .brain-detail-section {
    margin-bottom: var(--spacing-lg);
  }

  .brain-detail-section-title {
    font-size: var(--font-size-x-small);
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-dim);
    margin-bottom: var(--spacing-sm);
  }

  .brain-detail-field {
    margin-bottom: var(--spacing-smd);
  }

  .brain-detail-label {
    font-size: var(--font-size-x-small);
    color: var(--text-dim);
    margin-bottom: var(--spacing-xs);
  }

  .brain-detail-value {
    font-size: var(--font-size-label);
    color: var(--text);
    line-height: 1.5;
  }

  .brain-detail-value.editable {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: var(--spacing-sm);
    cursor: text;
    user-select: text;
    transition: border-color var(--transition-fast);
    outline: none;
    min-height: var(--spacing-xl);
  }

  .brain-detail-value.editable:focus {
    border-color: var(--accent);
  }

  textarea.brain-detail-value.editable {
    resize: vertical;
    min-height: 64px;
    font-family: inherit;
    font-size: var(--font-size-label);
    color: var(--text);
    width: 100%;
    display: block;
  }

  .brain-detail-actions {
    padding: var(--spacing-md);
    border-top: 1px solid var(--border);
    flex-shrink: 0;
  }
`;
