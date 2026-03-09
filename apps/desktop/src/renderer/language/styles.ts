import { css } from 'lit';

export const languageLayoutStyles = css`
  sauria-language {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: var(--bg-solid);
  }

  .language-header {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-md) var(--spacing-lg);
    border-bottom: 1px solid var(--border);
    -webkit-app-region: drag;
  }

  .language-header .palette-back {
    position: static;
    display: flex;
    z-index: auto;
    -webkit-app-region: no-drag;
  }

  .language-title {
    font-size: var(--font-size-heading);
    font-weight: 600;
    white-space: nowrap;
    -webkit-app-region: no-drag;
  }

  .language-search {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    margin-left: auto;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 0 var(--spacing-sm);
    height: var(--spacing-xl);
    width: 200px;
    -webkit-app-region: no-drag;
  }

  .language-search img {
    width: var(--spacing-md);
    height: var(--spacing-md);
    opacity: var(--opacity-muted);
    filter: brightness(0) invert();
  }

  .language-search input {
    background: none;
    border: none;
    outline: none;
    color: var(--text);
    font-size: var(--font-size-label);
    font-family: inherit;
    flex: 1;
    min-width: 0;
  }

  .language-search input::placeholder {
    color: var(--text-dim);
  }

  .language-body {
    flex: 1;
    overflow-y: auto;
    padding: var(--spacing-sm);
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .language-body::-webkit-scrollbar {
    width: var(--spacing-xs);
  }

  .language-body::-webkit-scrollbar-track {
    background: transparent;
  }

  .language-body::-webkit-scrollbar-thumb {
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
    filter: brightness(0) invert();
  }

  .lang-option.active .lang-check {
    opacity: 1;
  }
`;

export const languageViewStyles = [languageLayoutStyles];
