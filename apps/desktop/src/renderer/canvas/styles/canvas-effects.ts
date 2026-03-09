import { css } from 'lit';

export const canvasEffectStyles = css`
  /* --- Activity dots, node pulse, glow ring, bubbles --- */

  #activity-svg {
    z-index: var(--z-base);
  }

  .activity-dot {
    fill: var(--accent);
  }

  @keyframes nodePulse {
    0%,
    100% {
      opacity: 0.3;
      transform: scale(1);
    }
    50% {
      opacity: 0.8;
      transform: scale(1.08);
    }
  }

  .agent-card.node-active .agent-avatar::after {
    content: '';
    position: absolute;
    inset: calc(-1 * var(--spacing-xs));
    border-radius: 50%;
    border: 2px solid var(--accent);
    animation: nodePulse 1.5s ease-in-out infinite;
  }

  .agent-card.node-active {
    border-color: transparent;
  }

  .glow-ring {
    position: absolute;
    inset: -2px;
    border-radius: var(--spacing-lg);
    overflow: hidden;
    z-index: -1;
    pointer-events: none;
  }

  .glow-ring::before {
    content: '';
    position: absolute;
    inset: -50%;
    background: conic-gradient(var(--accent), transparent 25%, transparent 75%, var(--accent));
    animation: borderSpin 2s linear infinite;
  }

  @keyframes borderSpin {
    to {
      transform: rotate(360deg);
    }
  }

  .glow-ring-mask {
    position: absolute;
    inset: 2px;
    border-radius: var(--spacing-mld);
    background: color-mix(in srgb, var(--bg-solid) 92%, transparent);
  }

  .activity-bubble {
    position: absolute;
    max-width: 200px;
    padding: var(--spacing-sm) var(--spacing-smd);
    background: color-mix(in srgb, var(--bg-solid) 92%, transparent);
    border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
    border-radius: var(--radius-sm);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    font-size: var(--font-size-x-small);
    color: var(--text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    pointer-events: none;
    z-index: var(--z-base);
    transform: translate(-50%, -50%);
    opacity: 0;
    transition: opacity 0.3s ease;
  }

  .activity-bubble.visible {
    opacity: 1;
    pointer-events: auto;
    cursor: pointer;
  }

  /* --- Orbital integration bubbles --- */

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
    z-index: var(--z-base);
  }

  .orbital-bubble img {
    width: var(--spacing-md);
    height: var(--spacing-md);
  }

  .orbital-tooltip {
    position: absolute;
    bottom: calc(100% + var(--spacing-sm));
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
