import { css } from 'lit';

export const canvasAgentCardStyles = css`
  .agent-card {
    position: absolute;
    min-width: 120px;
    width: max-content;
    max-width: 200px;
    background: color-mix(in srgb, var(--bg-solid) 92%, transparent);
    border: 1px solid var(--border);
    border-radius: var(--spacing-mld);
    padding: var(--spacing-mld) var(--spacing-smd) var(--spacing-md);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--spacing-sm);
    cursor: grab;
    transition:
      border-color var(--transition-normal),
      box-shadow var(--transition-normal);
    user-select: none;
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    z-index: var(--z-base);
    transform-style: preserve-3d;
  }

  .agent-card:hover {
    border-color: var(--border-active);
  }

  .agent-card.selected {
    border-color: var(--accent);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 24%, transparent);
  }

  .agent-card.dragging {
    cursor: grabbing;
    opacity: 0.9;
    z-index: 100;
  }

  .agent-avatar {
    width: 56px;
    height: 56px;
    border-radius: 50%;
    background: var(--surface-light);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    overflow: hidden;
    position: relative;
  }

  .agent-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .agent-avatar svg {
    width: 28px;
    height: 28px;
  }

  .agent-status-dot {
    position: absolute;
    bottom: 0;
    right: 0;
    width: var(--spacing-smd);
    height: var(--spacing-smd);
    border-radius: 50%;
    border: 2px solid color-mix(in srgb, var(--bg-solid) 92%, transparent);
    z-index: var(--z-base);
  }

  .agent-status-dot.connected {
    background: var(--success);
  }

  .agent-status-dot.disconnected {
    background: var(--border-hover);
  }

  .agent-status-dot.error {
    background: var(--error);
  }

  .agent-name {
    font-size: var(--font-size-label);
    font-weight: 600;
    color: var(--text);
    word-break: break-word;
    white-space: normal;
    max-width: 100%;
    text-align: center;
    line-height: 1.2;
    margin-top: var(--spacing-xs);
  }

  .agent-handle {
    font-size: var(--font-size-x-small);
    font-weight: 400;
    color: var(--text-dim);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
    text-align: center;
    line-height: 1;
  }

  .agent-bot-info {
    font-size: var(--font-size-micro);
    font-weight: 400;
    color: var(--text-dim);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
    text-align: center;
    line-height: 1;
    margin-top: -4px;
  }

  .icon-mono {
    filter: brightness(0) invert(0.5);
  }
`;
