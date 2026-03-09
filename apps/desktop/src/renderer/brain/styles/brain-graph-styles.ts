import { css } from 'lit';

export const brainGraphStyles = css`
  .brain-graph-wrap {
    flex: 1;
    position: relative;
    overflow: hidden;
  }

  .brain-graph-wrap canvas {
    width: 100%;
    height: 100%;
    display: block;
  }

  .brain-graph-controls {
    position: absolute;
    bottom: var(--spacing-md);
    right: var(--spacing-md);
    display: flex;
    gap: var(--spacing-xs);
  }

  .brain-graph-btn {
    width: var(--spacing-xl);
    height: var(--spacing-xl);
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
    background: var(--bg-solid);
    color: var(--text-secondary);
    font-size: var(--font-size-lg);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: all var(--transition-fast);
    font-family: var(--font-family);
    line-height: 0;
    padding: 0;
    text-align: center;
  }

  .brain-graph-btn:hover {
    background: var(--surface-hover);
    color: var(--text);
  }

  .brain-graph-stats {
    position: absolute;
    bottom: var(--spacing-md);
    left: var(--spacing-md);
    font-size: var(--font-size-small);
    color: var(--text-dim);
    font-variant-numeric: tabular-nums;
  }

  .brain-graph-empty {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: var(--text-dim);
    font-size: var(--font-size-base);
    gap: var(--spacing-sm);
  }

  .brain-graph-empty img {
    width: var(--spacing-xxl);
    height: var(--spacing-xxl);
    opacity: 0.2;
    filter: brightness(0) invert();
  }
`;
