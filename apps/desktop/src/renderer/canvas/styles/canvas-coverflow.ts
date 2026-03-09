import { css } from 'lit';

export const canvasCoverflowStyles = css`
  .coverflow-dock {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    height: 180px;
    padding-bottom: var(--spacing-xl);
    display: flex;
    align-items: center;
    justify-content: center;
    perspective: 1200px;
    z-index: 150;
    background: linear-gradient(
      to bottom,
      transparent 0%,
      color-mix(in srgb, var(--bg-solid) 35%, transparent) 50%,
      color-mix(in srgb, var(--bg-solid) 55%, transparent) 100%
    );
    transition:
      transform 0.3s cubic-bezier(0.4, 0, 0.2, 1),
      opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .coverflow-dock.collapsed {
    transform: translateY(100%);
    pointer-events: none;
    opacity: 0;
  }

  .coverflow-track {
    display: flex;
    align-items: center;
    justify-content: center;
    transform-style: preserve-3d;
    position: relative;
    height: 140px;
  }

  .coverflow-card {
    position: absolute;
    width: 96px;
    height: 128px;
    border-radius: var(--radius-lg);
    background: color-mix(in srgb, var(--bg-solid) 85%, transparent);
    border: 1px solid var(--border-hover);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-sm);
    cursor: grab;
    user-select: none;
    transition: border-color var(--transition-fast);
    -webkit-box-reflect: below 4px linear-gradient(transparent 70%, var(--border));
  }

  .coverflow-card:hover {
    border-color: var(--border-active);
  }

  .cf-icon {
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .cf-icon svg,
  .cf-icon img {
    width: var(--spacing-xl);
    height: var(--spacing-xl);
  }

  .cf-name {
    font-size: var(--font-size-small);
    font-weight: 600;
    color: var(--text);
    text-align: center;
    line-height: 1;
  }

  .cf-hint {
    font-size: var(--font-size-micro);
    color: var(--text-dim);
    text-align: center;
    line-height: 1.2;
    padding: 0 var(--spacing-sm);
  }

  .coverflow-ghost {
    position: fixed;
    width: 96px;
    height: 128px;
    border-radius: var(--radius-lg);
    background: color-mix(in srgb, var(--bg-solid) 90%, transparent);
    border: 1px solid var(--border-active);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-smd);
    pointer-events: none;
    z-index: 1000;
    transition:
      opacity var(--transition-fast),
      transform var(--transition-fast);
    opacity: 0.85;
  }

  .coverflow-ghost.above-dock {
    opacity: 1;
    transform: scale(1.05);
  }
`;
