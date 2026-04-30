/**
 * Styles for the pixel art office view.
 */

import { css } from 'lit';

export const canvasOfficeStyles = css`
  /* ── View mode toggle (top-center, matches brain page pattern) ───── */

  .canvas-view-toggle {
    position: fixed;
    top: var(--spacing-md);
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    gap: 2px;
    background: var(--surface-light);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 2px;
    z-index: var(--z-toolbar);
  }

  .canvas-view-highlight {
    position: absolute;
    top: 2px;
    bottom: 2px;
    left: 2px;
    width: calc(50% - 2px);
    border-radius: var(--radius-sm);
    background: var(--accent-subtle);
    transition: left 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    pointer-events: none;
  }

  .canvas-view-toggle[data-active='office'] .canvas-view-highlight {
    left: 50%;
  }

  .canvas-view-seg {
    padding: var(--spacing-sm) var(--spacing-lg);
    font-size: var(--font-size-small);
    font-weight: 500;
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-dim);
    cursor: pointer;
    transition: color var(--transition-fast);
    position: relative;
    z-index: 1;
    font-family: inherit;
    line-height: var(--spacing-md);
  }

  .canvas-view-seg:hover {
    color: var(--text-secondary);
  }

  .canvas-view-seg.active {
    color: var(--accent);
  }

  /* ── Office viewport ─────────────────────────────────────────────── */

  .office-viewport {
    position: absolute;
    inset: 0;
    overflow: hidden;
    cursor: grab;
    background: #c9ad87;
  }

  .office-viewport.panning {
    cursor: grabbing;
  }

  .office-canvas {
    display: block;
    width: 100%;
    height: 100%;
    image-rendering: pixelated;
    image-rendering: crisp-edges;
  }

  .office-lobby-label {
    position: absolute;
    font-size: var(--font-size-small);
    color: var(--text-dim);
    pointer-events: none;
  }
`;
