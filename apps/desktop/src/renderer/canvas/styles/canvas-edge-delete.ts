import { css } from 'lit';

export const canvasEdgeDeleteStyles = css`
  .edge-delete-btn {
    position: absolute;
    width: var(--spacing-lg);
    height: var(--spacing-lg);
    border-radius: 50%;
    background: color-mix(in srgb, var(--bg-solid) 95%, transparent);
    border: 1px solid var(--border-hover);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2;
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.8);
    transition:
      opacity var(--transition-fast),
      transform var(--transition-fast),
      background 0.12s ease;
    pointer-events: none;
    padding: 0;
  }

  .edge-delete-btn.visible {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
    pointer-events: auto;
  }

  .edge-delete-btn:hover {
    background: color-mix(in srgb, var(--error) 25%, transparent);
    border-color: color-mix(in srgb, var(--error) 40%, transparent);
  }

  .edge-delete-btn img {
    width: var(--spacing-smd);
    height: var(--spacing-smd);
    filter: brightness(0) invert(0.5);
    transition: filter 0.12s ease;
  }

  .edge-delete-btn:hover img {
    filter: brightness(0) invert(0.8);
  }
`;
