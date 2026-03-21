import { css } from 'lit';

export const resetStyles = css`
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  body {
    font-family: var(--font-family);
    background: var(--bg-solid);
    color: var(--text);
    height: 100vh;
    overflow: hidden;
    user-select: none;
  }

  input,
  textarea,
  [contenteditable] {
    user-select: text;
  }

  ::selection {
    background: var(--accent);
    color: var(--text-on-accent);
  }

  ::-webkit-scrollbar {
    width: var(--spacing-sm);
    height: var(--spacing-sm);
  }

  ::-webkit-scrollbar-track {
    background: transparent;
  }

  ::-webkit-scrollbar-thumb {
    background: var(--border);
    border-radius: var(--spacing-xs);
  }

  ::-webkit-scrollbar-thumb:hover {
    background: var(--border-hover);
  }

  ::-webkit-scrollbar-corner {
    background: transparent;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(var(--spacing-sm));
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  *:focus {
    outline: none;
    -webkit-focus-ring-color: transparent;
  }

  .icon-mono {
    filter: brightness(0) invert();
  }

  .palette-back {
    position: fixed;
    top: var(--spacing-md);
    left: var(--spacing-md);
    width: var(--spacing-xl);
    height: var(--spacing-xl);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: color-mix(in srgb, var(--bg-solid) 90%, transparent);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    cursor: pointer;
    display: none;
    align-items: center;
    justify-content: center;
    z-index: var(--z-toolbar);
    padding: 0;
    transition: all var(--transition-normal);
  }

  .palette-back:hover {
    background: var(--surface-hover);
    border-color: var(--border-active);
  }

  .palette-back img {
    width: var(--spacing-md);
    height: var(--spacing-md);
    filter: brightness(0) invert(0.4);
    transition: filter var(--transition-fast);
  }

  .palette-back:hover img {
    filter: brightness(0) invert(0.7);
  }

  body.in-palette .palette-back {
    display: flex;
  }

  body.in-palette {
    animation: fadeIn var(--transition-fast);
  }

  .update-banner {
    position: fixed;
    bottom: calc(-1 * var(--spacing-xxl));
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-xs) var(--spacing-md);
    background: var(--surface);
    border: 1px solid var(--accent);
    border-radius: var(--radius-pill);
    font-size: var(--font-size-small);
    color: var(--text);
    backdrop-filter: blur(var(--spacing-smd));
    transition: bottom var(--transition-normal);
    z-index: var(--z-toast);
  }

  .update-banner.visible {
    bottom: var(--spacing-md);
  }

  .update-btn {
    background: var(--accent);
    color: var(--text-on-accent);
    border: none;
    border-radius: var(--radius-pill);
    padding: var(--spacing-xs) var(--spacing-sm);
    font-size: var(--font-size-small);
    cursor: pointer;
    transition: background var(--transition-fast);
  }

  .update-btn:hover {
    background: var(--accent-hover);
  }

  .update-btn:disabled {
    opacity: var(--opacity-muted);
    cursor: wait;
  }
`;
