import { css } from 'lit';

export const paletteCommandStyles = css`
  /* -- Search bar -- */

  .search-bar {
    display: flex;
    align-items: center;
    gap: var(--spacing-smd);
    padding: var(--spacing-smd) var(--spacing-md);
    border-bottom: 0.5px solid var(--border);
  }

  .search-icon {
    width: 28px;
    height: 28px;
    flex-shrink: 0;
    cursor: pointer;
    border-radius: var(--radius-sm);
    border: none;
    background: none;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.1s ease;
  }

  .search-icon:hover {
    background: color-mix(in srgb, var(--text) 8%, transparent);
  }

  .search-icon img {
    width: var(--spacing-md);
    height: var(--spacing-md);
    filter: brightness(0) invert();
    opacity: var(--opacity-muted);
  }

  .search-bar input {
    flex: 1;
    background: none;
    border: none;
    color: var(--text);
    font-size: var(--font-size-base);
    font-family: inherit;
  }

  .search-bar input::placeholder {
    color: color-mix(in srgb, var(--text) 30%, transparent);
  }

  /* -- Command list -- */

  .command-list {
    flex: 1;
    overflow-y: auto;
    padding: var(--spacing-sm);
  }

  .command-list::-webkit-scrollbar {
    width: var(--spacing-xs);
  }

  .command-list::-webkit-scrollbar-track {
    background: transparent;
  }

  .command-list::-webkit-scrollbar-thumb {
    background: var(--border);
    border-radius: var(--spacing-xs);
  }

  .command-row {
    display: flex;
    align-items: center;
    gap: var(--spacing-smd);
    padding: var(--spacing-sm);
    border-radius: var(--radius-sm);
    cursor: default;
    transition: background 0.08s ease;
    height: 40px;
  }

  .command-row.selected {
    background: var(--border);
  }

  .command-row .icon {
    width: 28px;
    height: 28px;
    border-radius: var(--radius-sm);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    background: color-mix(in srgb, var(--text) 5%, transparent);
  }

  .command-row .icon img {
    width: var(--spacing-md);
    height: var(--spacing-md);
  }

  .command-row .icon img.icon-mono {
    filter: brightness(0) invert();
    opacity: var(--opacity-muted);
  }

  .command-row .label {
    flex: 1;
    font-size: var(--font-size-label);
    font-weight: 400;
    color: color-mix(in srgb, var(--text) 85%, transparent);
  }

  .command-row.selected .label {
    color: var(--text-on-accent);
  }

  .command-row .hint {
    font-size: var(--font-size-x-small);
    color: color-mix(in srgb, var(--text) 25%, transparent);
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
  }

  /* -- Status dot -- */

  .status-dot {
    width: var(--spacing-sm);
    height: var(--spacing-sm);
    border-radius: 50%;
    flex-shrink: 0;
    animation: pulse-dot 2s ease-in-out infinite;
  }

  .status-dot.connected {
    background: var(--success);
    box-shadow: 0 0 var(--spacing-xs) var(--success);
  }

  .status-dot.disconnected {
    background: var(--error);
    box-shadow: 0 0 var(--spacing-xs) var(--error);
  }

  @keyframes pulse-dot {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: var(--opacity-disabled);
    }
  }

  /* -- Result panel -- */

  .result-panel {
    display: none;
    border-top: 0.5px solid var(--border);
    padding: var(--spacing-smd) var(--spacing-md);
    max-height: 140px;
    overflow-y: auto;
    font-family: var(--font-family-mono);
    font-size: var(--font-size-x-small);
    line-height: 1.6;
    color: color-mix(in srgb, var(--text) 55%, transparent);
    white-space: pre-wrap;
    word-break: break-word;
    background: color-mix(in srgb, var(--bg-solid) 12%, transparent);
  }

  .result-panel.visible {
    display: block;
    animation: fadeIn var(--transition-fast);
  }
`;
