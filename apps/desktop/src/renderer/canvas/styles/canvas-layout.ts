import { css } from 'lit';

export const canvasLayoutStyles = css`
  /* --- Viewport and world --- */

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

  /* --- Workspace frames, resize handles --- */

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
    pointer-events: none;
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
    min-height: calc(2 * var(--spacing-mld));
    pointer-events: auto;
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
    transition: all var(--transition-fast);
    margin-left: auto;
    pointer-events: auto;
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
    transition: filter var(--transition-fast);
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
    pointer-events: auto;
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
    z-index: var(--z-base);
    pointer-events: auto;
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

  /* --- Coverflow dock, cards, ghost --- */

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
    z-index: var(--z-dock);
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
    z-index: var(--z-ghost);
    transition:
      opacity var(--transition-fast),
      transform var(--transition-fast);
    opacity: 0.85;
  }

  .coverflow-ghost.above-dock {
    opacity: 1;
    transform: scale(1.05);
  }

  /* --- Dock toggle button --- */

  .dock-toggle {
    position: fixed;
    bottom: 200px;
    right: var(--spacing-md);
    width: 36px;
    height: 36px;
    border-radius: var(--radius);
    border: 1px solid var(--border);
    background: color-mix(in srgb, var(--bg-solid) 90%, transparent);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: var(--z-toolbar);
    transition: all var(--transition-normal);
    padding: 0;
  }

  .dock-toggle.collapsed {
    bottom: var(--spacing-md);
  }

  .dock-toggle:hover {
    background: var(--surface-hover);
    border-color: var(--border-active);
  }

  .dock-toggle img {
    width: var(--spacing-md);
    height: var(--spacing-md);
    filter: brightness(0) invert(0.4);
    transition:
      filter var(--transition-fast),
      transform var(--transition-normal);
  }

  .dock-toggle:hover img {
    filter: brightness(0) invert(0.7);
  }

  .dock-toggle.collapsed img {
    transform: rotate(180deg);
  }

  /* --- Edge delete button --- */

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
    z-index: var(--z-dropdown);
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.8);
    transition:
      opacity var(--transition-fast),
      transform var(--transition-fast),
      background var(--transition-fast);
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
    transition: filter var(--transition-fast);
  }

  .edge-delete-btn:hover img {
    filter: brightness(0) invert(0.8);
  }
`;
