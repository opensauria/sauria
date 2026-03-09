import { css } from 'lit';

export const paletteLanguageStyles = css`
  .language-panel {
    display: none;
    border-top: 0.5px solid var(--border);
    padding: var(--spacing-smd);
    background: color-mix(in srgb, var(--bg-solid) 12%, transparent);
    animation: fadeIn var(--transition-fast);
    flex: 1;
    overflow: hidden;
    flex-direction: column;
  }

  .language-panel.visible {
    display: flex;
  }

  .language-list {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .language-list::-webkit-scrollbar {
    width: var(--spacing-xs);
  }

  .language-list::-webkit-scrollbar-track {
    background: transparent;
  }

  .language-list::-webkit-scrollbar-thumb {
    background: var(--border);
    border-radius: var(--spacing-xs);
  }

  .lang-option {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-sm) var(--spacing-smd);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: background 0.08s ease;
    font-size: var(--font-size-label);
    color: color-mix(in srgb, var(--text) 75%, transparent);
    flex-shrink: 0;
  }

  .lang-option:hover {
    background: var(--border);
  }

  .lang-option.active {
    background: var(--accent-subtle);
    color: var(--accent);
  }

  .lang-option .lang-check {
    width: var(--spacing-md);
    height: var(--spacing-md);
    flex-shrink: 0;
    opacity: 0;
  }

  .lang-option.active .lang-check {
    opacity: 1;
  }
`;
