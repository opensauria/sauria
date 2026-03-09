import { css } from 'lit';

export const canvasActivityStyles = css`
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
    inset: -4px;
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
    z-index: 2;
    transform: translate(-50%, -50%);
    opacity: 0;
    transition: opacity 0.3s ease;
  }

  .activity-bubble.visible {
    opacity: 1;
    pointer-events: auto;
    cursor: pointer;
  }
`;
