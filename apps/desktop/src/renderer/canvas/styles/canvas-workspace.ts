import { css } from 'lit';

export const canvasWorkspaceStyles = css`
  .workspace-frame {
    position: absolute;
    min-width: 320px;
    min-height: 240px;
    border: 2px solid var(--border-active);
    border-radius: var(--radius-lg);
    background: var(--surface);
    z-index: var(--z-base);
    user-select: none;
    cursor: grab;
    transition:
      border-color var(--transition-normal),
      box-shadow var(--transition-normal);
  }

  .workspace-frame.drop-target {
    box-shadow:
      0 0 0 4px color-mix(in srgb, var(--accent) 18%, transparent),
      0 0 24px color-mix(in srgb, var(--accent) 8%, transparent);
  }

  .workspace-frame.selected {
    border-color: var(--accent);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 24%, transparent);
  }

  .workspace-header {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-sm) var(--spacing-md);
    cursor: grab;
    min-height: 40px;
  }

  .workspace-name {
    font-size: var(--font-size-base);
    font-weight: 600;
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .workspace-count {
    font-size: var(--font-size-micro);
    font-weight: 500;
    padding: 2px var(--spacing-sm);
    border-radius: var(--radius-sm);
    background: var(--border);
    color: var(--text-secondary);
    flex-shrink: 0;
  }

  .workspace-purpose {
    font-size: var(--font-size-small);
    color: var(--text-dim);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
    min-width: 0;
  }

  .ws-gear {
    width: var(--spacing-lg);
    height: var(--spacing-lg);
    border-radius: var(--radius-sm);
    border: none;
    background: transparent;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    flex-shrink: 0;
    opacity: 0;
    transition: all 0.12s ease;
    margin-left: auto;
  }

  .workspace-frame:hover .ws-gear {
    opacity: 1;
  }

  .ws-gear:hover {
    background: var(--surface-hover);
  }

  .ws-gear img {
    width: var(--spacing-md);
    height: var(--spacing-md);
    filter: brightness(0) invert(0.4);
    transition: filter 0.12s ease;
  }

  .ws-gear:hover img {
    filter: brightness(0) invert(0.7);
  }

  .ws-lock {
    width: var(--spacing-lg);
    height: var(--spacing-lg);
    border-radius: var(--radius-sm);
    border: none;
    background: transparent;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    opacity: 0;
    transition: opacity var(--transition-fast);
    color: var(--text-dim);
  }

  .workspace-frame:hover .ws-lock {
    opacity: 1;
  }

  .ws-lock:hover {
    background: var(--surface-hover);
    color: var(--text-secondary);
  }

  .ws-lock.locked {
    opacity: 1;
    color: var(--accent);
  }

  .workspace-frame.locked .workspace-resize {
    display: none;
  }

  .workspace-resize {
    position: absolute;
    z-index: 2;
  }

  .workspace-resize-r {
    top: var(--spacing-md);
    right: -4px;
    width: var(--spacing-sm);
    bottom: var(--spacing-md);
    cursor: e-resize;
  }

  .workspace-resize-b {
    left: var(--spacing-md);
    bottom: -4px;
    height: var(--spacing-sm);
    right: var(--spacing-md);
    cursor: s-resize;
  }

  .workspace-resize-br {
    right: -4px;
    bottom: -4px;
    width: var(--spacing-md);
    height: var(--spacing-md);
    cursor: se-resize;
    border-radius: 0 0 var(--radius-sm) 0;
  }
`;
