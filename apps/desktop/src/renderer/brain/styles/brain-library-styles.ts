import { css } from 'lit';

export const brainLibraryStyles = css`
  .brain-library {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  .brain-library-track {
    position: relative;
    width: 100%;
    height: 320px;
    display: flex;
    align-items: center;
    justify-content: center;
    transform-style: preserve-3d;
  }

  .brain-library-card {
    position: absolute;
    width: 200px;
    height: 280px;
    border-radius: var(--radius-lg);
    background: color-mix(in srgb, var(--bg-solid) 85%, transparent);
    border: 1px solid var(--border);
    backdrop-filter: blur(16px);
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: var(--spacing-lg) var(--spacing-md);
    gap: var(--spacing-sm);
    cursor: pointer;
    user-select: none;
    transition: border-color var(--transition-fast);
    -webkit-box-reflect: below 4px linear-gradient(transparent 75%, var(--surface-light));
  }

  .brain-library-card:hover {
    border-color: var(--border-hover);
  }

  .brain-library-card-dot {
    width: 56px;
    height: 56px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 24px;
    font-weight: 700;
    color: color-mix(in srgb, var(--text-on-accent) 90%, transparent);
    flex-shrink: 0;
    margin-bottom: var(--spacing-sm);
  }

  .brain-library-card-name {
    font-size: var(--font-size-base);
    font-weight: 600;
    color: var(--text);
    text-align: center;
    line-height: 1.3;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  .brain-library-card-type {
    display: inline-block;
    font-size: var(--font-size-x-small);
    padding: 2px var(--spacing-sm);
    border-radius: var(--radius-sm);
    font-weight: 500;
  }

  .brain-library-card-summary {
    font-size: var(--font-size-small);
    color: var(--text-secondary);
    text-align: center;
    line-height: 1.4;
    flex: 1;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 4;
    -webkit-box-orient: vertical;
    padding: 0 var(--spacing-xs);
  }

  .brain-library-card-meta {
    font-size: var(--font-size-x-small);
    color: var(--text-dim);
    font-variant-numeric: tabular-nums;
  }

  .brain-library-search {
    position: absolute;
    bottom: var(--spacing-lg);
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    background: color-mix(in srgb, var(--bg-solid) 85%, transparent);
    backdrop-filter: blur(16px);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: var(--spacing-sm) var(--spacing-md);
    width: 320px;
    max-width: calc(100% - var(--spacing-xxl));
    z-index: 5;
    transition: border-color var(--transition-fast);
  }

  .brain-library-search:focus-within {
    border-color: var(--accent);
  }

  .brain-library-search img {
    width: var(--spacing-md);
    height: var(--spacing-md);
    opacity: var(--opacity-disabled);
    filter: brightness(0) invert();
    flex-shrink: 0;
  }

  .brain-library-search input {
    flex: 1;
    background: none;
    border: none;
    color: var(--text);
    font-size: var(--font-size-label);
    outline: none;
    font-family: inherit;
  }

  .brain-library-search input::placeholder {
    color: var(--text-dim);
  }

  .brain-library-empty {
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

  .brain-library-empty img {
    width: var(--spacing-xxl);
    height: var(--spacing-xxl);
    opacity: 0.2;
    filter: brightness(0) invert();
  }
`;
