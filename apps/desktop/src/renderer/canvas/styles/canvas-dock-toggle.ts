import { css } from 'lit';

export const canvasDockToggleStyles = css`
  .dock-toggle {
    position: fixed;
    bottom: 200px;
    right: var(--spacing-md);
    width: 36px;
    height: 36px;
    border-radius: var(--radius);
    border: 1px solid var(--border);
    background: color-mix(in srgb, var(--bg-solid) 90%, transparent);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 200;
    transition: all var(--transition-normal);
    padding: 0;
  }

  .dock-toggle.collapsed {
    bottom: var(--spacing-md);
  }

  .dock-toggle:hover {
    background: var(--surface-hover);
    border-color: var(--border-active);
  }

  .dock-toggle img {
    width: var(--spacing-md);
    height: var(--spacing-md);
    filter: brightness(0) invert(0.4);
    transition:
      filter 0.12s ease,
      transform var(--transition-normal);
  }

  .dock-toggle:hover img {
    filter: brightness(0) invert(0.7);
  }

  .dock-toggle.collapsed img {
    transform: rotate(180deg);
  }
`;
