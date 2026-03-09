import { css } from 'lit';

export const canvasOrbitalStyles = css`
  @keyframes orbitalPopIn {
    0% {
      opacity: 0;
      transform: translate(-50%, -50%) scale(0);
    }
    70% {
      transform: translate(-50%, -50%) scale(1.15);
    }
    100% {
      opacity: 1;
      transform: translate(-50%, -50%) scale(1);
    }
  }

  .orbital-bubble {
    position: absolute;
    width: var(--spacing-lg);
    height: var(--spacing-lg);
    border-radius: 50%;
    background: color-mix(in srgb, var(--bg-solid) 92%, transparent);
    border: 1px solid var(--border-hover);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: auto;
    opacity: 0;
    animation: orbitalPopIn 0.25s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
    z-index: 2;
  }

  .orbital-bubble img {
    width: var(--spacing-md);
    height: var(--spacing-md);
  }

  .orbital-tooltip {
    position: absolute;
    bottom: calc(100% + 8px);
    left: 50%;
    transform: translateX(-50%);
    background: color-mix(in srgb, var(--bg-solid) 95%, transparent);
    border: 1px solid var(--border-hover);
    border-radius: var(--radius-sm);
    padding: var(--spacing-xs) var(--spacing-sm);
    font-size: var(--font-size-x-small);
    color: var(--text);
    white-space: nowrap;
    pointer-events: none;
    opacity: 0;
    transition: opacity var(--transition-fast);
  }

  .orbital-bubble:hover .orbital-tooltip {
    opacity: 1;
  }
`;
