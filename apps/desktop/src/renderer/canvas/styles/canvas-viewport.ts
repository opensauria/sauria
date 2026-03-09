import { css } from 'lit';

export const canvasViewportStyles = css`
  @font-face {
    font-family: 'Geist Mono';
    src: local('GeistMono-Regular'), local('Geist Mono');
    font-weight: 400;
    font-display: swap;
  }

  .canvas-viewport {
    position: absolute;
    inset: 0;
    overflow: hidden;
    cursor: grab;
    background: radial-gradient(circle at 1px 1px, var(--border) 1px, transparent 0);
    background-size: var(--spacing-lg) var(--spacing-lg);
    background-color: var(--bg);
  }

  .canvas-viewport.grabbing {
    cursor: grabbing;
  }

  .canvas-world {
    position: absolute;
    top: 0;
    left: 0;
    will-change: transform;
    transform-origin: 0 0;
  }
`;
