import { css } from 'lit';

export const canvasPanelStyles = css`
  /* Workspace detail panel */
  .ws-panel {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    max-width: 100%;
    background: var(--bg-solid);
    border-left: 1px solid var(--border);
    z-index: var(--z-panel);
    transform: translateX(100%);
    transition: transform var(--transition-normal);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .ws-panel.open {
    transform: translateX(0);
  }
  .ws-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--spacing-md) var(--spacing-lg);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }
  .ws-title {
    font-size: var(--font-size-small);
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .ws-close-btn {
    width: var(--spacing-xl);
    height: var(--spacing-xl);
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    cursor: pointer;
    color: var(--text-dim);
    border-radius: var(--radius-sm);
  }
  .ws-close-btn:hover {
    background: var(--surface-hover);
    color: var(--text-secondary);
  }
  .ws-body {
    padding: var(--spacing-lg);
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-lg);
    overflow-y: auto;
  }
  .ws-section {
  }
  .ws-label {
    display: block;
    font-size: var(--font-size-small);
    font-weight: 500;
    color: var(--text-dim);
    text-transform: uppercase;
    letter-spacing: 0.3px;
    margin-bottom: var(--spacing-xs);
  }
  workspace-detail-panel input,
  workspace-detail-panel textarea {
    width: 100%;
    box-sizing: border-box;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: var(--spacing-smd) var(--spacing-md);
    color: var(--text);
    font-size: var(--font-size-base);
    font-family: inherit;
    outline: none;
    transition: border-color var(--transition-fast);
  }
  workspace-detail-panel textarea {
    resize: vertical;
    min-height: 100px;
  }
  workspace-detail-panel input:focus,
  workspace-detail-panel textarea:focus {
    border-color: var(--accent);
  }
  .ws-colors {
    display: flex;
    gap: var(--spacing-sm);
  }
  .ws-swatch {
    width: var(--spacing-lg);
    height: var(--spacing-lg);
    border-radius: 50%;
    border: 2px solid transparent;
    cursor: pointer;
  }
  .ws-swatch.active {
    border-color: var(--text);
  }
  .ws-tags {
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-xs);
    align-items: center;
  }
  .ws-tag {
    display: inline-flex;
    align-items: center;
    gap: var(--spacing-xs);
    padding: 2px var(--spacing-sm);
    background: var(--surface);
    border-radius: var(--radius-sm);
    font-size: var(--font-size-small);
    color: var(--text-secondary);
  }
  .ws-tag-remove {
    background: none;
    border: none;
    color: var(--text-dim);
    cursor: pointer;
    font-size: var(--font-size-small);
    padding: 0;
  }
  .ws-tag-input {
    flex: 1;
    min-width: 80px;
    border: none !important;
    padding: var(--spacing-xs) !important;
    background: transparent !important;
    color: var(--text);
    font-size: var(--font-size-small);
    outline: none;
  }
  /* Shared stepper */
  .stepper {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
  }
  .stepper-btn {
    width: var(--spacing-2xl);
    height: var(--spacing-2xl);
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    cursor: pointer;
    color: var(--text-secondary);
    flex-shrink: 0;
    transition:
      background var(--transition-fast),
      border-color var(--transition-fast),
      color var(--transition-fast);
  }
  .stepper-btn:hover {
    background: var(--surface-hover);
    border-color: var(--border-active);
    color: var(--text);
  }
  .stepper-input {
    width: var(--spacing-xxl);
    height: var(--spacing-2xl);
    box-sizing: border-box;
    text-align: center;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 0 var(--spacing-xs);
    color: var(--text);
    font-size: var(--font-size-base);
    font-family: inherit;
    font-variant-numeric: tabular-nums;
    outline: none;
    transition: border-color var(--transition-fast);
    -moz-appearance: textfield;
  }
  .stepper-input::-webkit-inner-spin-button,
  .stepper-input::-webkit-outer-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
  .stepper-input:focus {
    border-color: var(--accent);
  }

  /* Panel resize handle */
  .panel-resize-handle {
    position: absolute;
    top: 0;
    left: 0;
    bottom: 0;
    width: var(--spacing-xs);
    cursor: col-resize;
    z-index: 1;
    transition: background var(--transition-fast);
  }
  .panel-resize-handle:hover,
  .panel-resize-handle.dragging {
    background: var(--accent);
  }

  /* Conversation panel */
  .conv-panel {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    max-width: 100%;
    background: var(--bg-solid);
    border-left: 1px solid var(--border);
    z-index: var(--z-panel);
    transform: translateX(100%);
    transition: transform var(--transition-normal);
    display: flex;
    flex-direction: column;
  }
  .conv-panel.open {
    transform: translateX(0);
  }
  .conv-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--spacing-md);
    border-bottom: 1px solid var(--border);
  }
  .conv-close-btn {
    width: var(--spacing-xl);
    height: var(--spacing-xl);
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    cursor: pointer;
    color: var(--text-secondary);
    border-radius: var(--radius-sm);
  }
  .conv-close-btn:hover {
    background: var(--surface-hover);
  }
  .conv-participants {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    flex: 1;
  }
  .conv-participant {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
    font-size: var(--font-size-base);
    color: var(--text-secondary);
  }
  .conv-participant-avatar {
    width: var(--spacing-lg);
    height: var(--spacing-lg);
    border-radius: 50%;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--surface);
    flex-shrink: 0;
  }
  .conv-participant-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .conv-separator {
    color: var(--text-dim);
  }
  .conv-feed-title {
    display: flex;
    flex-direction: column;
  }
  .conv-feed-title-text {
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-size: var(--font-size-small);
    font-weight: 600;
    color: var(--text-secondary);
  }
  .conv-feed-count {
    font-size: var(--font-size-micro);
    color: var(--text-secondary);
  }
  .conv-filters {
    display: flex;
    gap: var(--spacing-xs);
    padding: var(--spacing-sm) var(--spacing-md);
    overflow-x: auto;
    border-bottom: 1px solid var(--border);
  }
  .conv-filter-pill {
    padding: var(--spacing-xs) var(--spacing-smd);
    border-radius: var(--radius-pill);
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--text-secondary);
    font-size: var(--font-size-small);
    cursor: pointer;
    white-space: nowrap;
  }
  .conv-filter-pill.active {
    background: var(--accent);
    color: var(--text-on-accent);
    border-color: var(--accent);
  }
  .conv-messages {
    flex: 1;
    overflow-y: auto;
    padding: var(--spacing-md);
  }
  .conv-empty {
    text-align: center;
    color: var(--text-dim);
    font-size: var(--font-size-base);
    padding: var(--spacing-xl) var(--spacing-md);
  }
  .conv-msg-row {
    display: flex;
    gap: var(--spacing-sm);
    margin-bottom: var(--spacing-smd);
  }
  .conv-msg-row.to {
    flex-direction: row-reverse;
  }
  .conv-msg-avatar {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--surface);
    flex-shrink: 0;
  }
  .conv-msg-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .conv-msg-bubble {
    max-width: 260px;
    background: var(--surface);
    border-radius: var(--radius);
    padding: var(--spacing-sm) var(--spacing-smd);
  }
  .conv-msg-row.to .conv-msg-bubble {
    background: var(--accent-subtle);
  }
  .conv-msg-sender {
    font-size: var(--font-size-micro);
    color: var(--text-secondary);
    margin-bottom: 2px;
  }
  .conv-msg-content {
    font-size: var(--font-size-base);
    color: var(--text);
    line-height: 1.4;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .conv-msg-footer {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    margin-top: var(--spacing-xs);
  }
  .conv-msg-type-badge {
    font-size: var(--font-size-micro);
    padding: 2px var(--spacing-sm);
    border-radius: var(--spacing-xs);
    background: var(--surface-hover);
    color: var(--text-dim);
    font-weight: 500;
    letter-spacing: 0.02em;
  }
  .conv-badge-forward {
    background: color-mix(in srgb, var(--accent) 15%, transparent);
    color: var(--accent);
  }
  .conv-badge-reply {
    background: color-mix(in srgb, var(--text-secondary) 12%, transparent);
    color: var(--text-secondary);
  }
  .conv-badge-conclude {
    background: color-mix(in srgb, var(--success) 15%, transparent);
    color: var(--success);
  }
  .conv-badge-notify {
    background: color-mix(in srgb, var(--warning) 15%, transparent);
    color: var(--warning);
  }
  .conv-badge-assign {
    background: color-mix(in srgb, var(--accent) 12%, transparent);
    color: var(--accent);
  }
  .conv-msg-time {
    font-size: var(--font-size-micro);
    color: var(--text-dim);
  }
  .conv-status {
    padding: var(--spacing-sm) var(--spacing-md);
    font-size: var(--font-size-small);
    color: var(--text-secondary);
    border-top: 1px solid var(--border);
  }
  .conv-status.idle {
    color: var(--text-dim);
  }
  .conv-status:not(.idle) {
    animation: conv-pulse 1.5s ease-in-out infinite;
  }
  @keyframes conv-pulse {
    0%,
    100% {
      opacity: var(--opacity-subtle);
    }
    50% {
      opacity: var(--opacity-disabled);
    }
  }
  @keyframes conv-msg-enter {
    from {
      opacity: 0;
      transform: translateY(var(--spacing-sm));
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  .conv-msg-new {
    animation: conv-msg-enter var(--transition-normal) ease-out;
  }

  /* Canvas toolbar */
  .canvas-toolbar {
    position: fixed;
    bottom: var(--spacing-md);
    left: var(--spacing-md);
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
    padding: var(--spacing-xs);
    background: color-mix(in srgb, var(--bg-solid) 90%, transparent);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    backdrop-filter: blur(var(--spacing-md));
    -webkit-backdrop-filter: blur(var(--spacing-md));
    z-index: var(--z-toolbar);
    transition: bottom var(--transition-normal);
  }
  .toolbar-group {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
  }
  .toolbar-btn {
    width: var(--spacing-xl);
    height: var(--spacing-xl);
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: transparent;
    border-radius: var(--radius-sm);
    cursor: pointer;
    color: var(--text-secondary);
    transition: background var(--transition-fast);
  }
  .toolbar-btn:hover {
    background: var(--surface-hover);
  }
  .toolbar-btn img,
  .toolbar-btn svg {
    width: var(--spacing-md);
    height: var(--spacing-md);
    filter: brightness(0) invert();
    opacity: var(--opacity-muted);
  }
  .toolbar-btn svg {
    filter: none;
    opacity: 1;
  }
  .zoom-display {
    min-width: 44px;
    text-align: center;
    font-size: var(--font-size-small);
    color: var(--text-dim);
    font-variant-numeric: tabular-nums;
  }
  .toolbar-btn.spinning img {
    animation: toolbar-spin 1s linear infinite;
  }
  @keyframes toolbar-spin {
    to {
      transform: rotate(360deg);
    }
  }
  .activity-btn {
    position: relative;
  }
  .activity-btn.active {
    background: color-mix(in srgb, var(--accent) 15%, transparent);
  }
  .activity-badge {
    position: absolute;
    top: 2px;
    right: 2px;
    min-width: var(--spacing-md);
    height: var(--spacing-md);
    padding: 0 var(--spacing-xs);
    border-radius: var(--radius-sm);
    background: var(--error);
    color: var(--text-on-accent);
    font-size: var(--font-size-micro);
    line-height: var(--spacing-md);
    text-align: center;
    display: none;
  }
  .activity-badge.visible {
    display: block;
  }

  /* Canvas empty state */
  .canvas-empty {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    text-align: center;
    pointer-events: none;
    z-index: var(--z-base);
  }
  .canvas-empty-icons {
    display: flex;
    gap: var(--spacing-md);
    justify-content: center;
    margin-bottom: var(--spacing-lg);
    opacity: var(--opacity-disabled);
  }
  .canvas-empty-icons img {
    width: var(--spacing-xl);
    height: var(--spacing-xl);
  }
  .canvas-empty h2 {
    margin: 0 0 var(--spacing-sm);
    font-size: var(--font-size-heading);
    font-weight: 500;
    color: var(--text-secondary);
  }
  .canvas-empty p {
    margin: 0;
    font-size: var(--font-size-base);
    color: var(--text-dim);
  }

  /* Confirm dialog */
  .confirm-overlay {
    position: fixed;
    inset: 0;
    background: var(--overlay);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: var(--z-modal);
    opacity: 0;
    pointer-events: none;
    transition: opacity var(--transition-fast);
  }
  .confirm-overlay.open {
    opacity: 1;
    pointer-events: auto;
  }
  .confirm-dialog {
    background: var(--bg-solid);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: var(--spacing-lg);
    max-width: 360px;
    width: 90%;
  }
  .confirm-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--spacing-sm);
    margin-bottom: var(--spacing-mld);
  }
  .confirm-header p {
    margin: 0;
    font-size: var(--font-size-base);
    color: var(--text);
  }
  .confirm-actions {
    display: flex;
    gap: var(--spacing-sm);
    justify-content: flex-end;
  }

  /* Activity legend */
  .canvas-legend {
    position: fixed;
    top: var(--spacing-md);
    right: var(--spacing-md);
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
    padding: var(--spacing-smd) var(--spacing-md);
    background: var(--bg-solid);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    z-index: var(--z-toast);
    opacity: 0;
    transform: translateY(calc(-1 * var(--spacing-sm)));
    pointer-events: none;
    transition:
      opacity var(--transition-normal),
      transform var(--transition-normal);
  }
  .canvas-legend.visible {
    opacity: 1;
    transform: translateY(0);
    pointer-events: auto;
  }
  .legend-item {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    font-size: var(--font-size-small);
    color: var(--text-secondary);
    justify-content: flex-start;
  }
  .legend-dot {
    width: var(--spacing-sm);
    height: var(--spacing-sm);
    border-radius: 50%;
    background: var(--accent);
    box-shadow: var(--shadow-glow);
    flex-shrink: 0;
  }
  .legend-ring {
    width: var(--spacing-sm);
    height: var(--spacing-sm);
    border-radius: 50%;
    border: 2px solid var(--accent);
    box-shadow: var(--shadow-glow);
    flex-shrink: 0;
  }

  /* Workspace dialog */
  .ws-dialog-overlay {
    position: fixed;
    inset: 0;
    background: var(--overlay);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: var(--z-modal);
    opacity: 0;
    pointer-events: none;
    transition: opacity var(--transition-fast);
  }
  .ws-dialog-overlay.open {
    opacity: 1;
    pointer-events: auto;
  }
  .ws-dialog {
    background: var(--bg-solid);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: var(--spacing-lg);
    width: 380px;
    max-width: 90%;
  }
  .ws-dialog h3 {
    margin: 0 0 var(--spacing-md);
    font-size: var(--font-size-heading);
    color: var(--text);
  }
  .ws-dialog-field {
    margin-bottom: var(--spacing-smd);
  }
  .ws-dialog-field label {
    display: block;
    font-size: var(--font-size-small);
    color: var(--text-secondary);
    margin-bottom: var(--spacing-xs);
  }
  .ws-dialog input,
  .ws-dialog textarea {
    width: 100%;
    box-sizing: border-box;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: var(--spacing-smd) var(--spacing-md);
    color: var(--text);
    font-size: var(--font-size-base);
    font-family: inherit;
    outline: none;
    transition: border-color var(--transition-fast);
  }
  .ws-dialog textarea {
    resize: vertical;
    min-height: 100px;
  }
  .ws-dialog input:focus,
  .ws-dialog textarea:focus {
    border-color: var(--accent);
  }
  .ws-dialog-colors {
    display: flex;
    gap: var(--spacing-sm);
    margin-bottom: var(--spacing-smd);
  }
  .ws-dialog-swatch {
    width: var(--spacing-lg);
    height: var(--spacing-lg);
    border-radius: 50%;
    border: 2px solid transparent;
    cursor: pointer;
    transition: border-color var(--transition-fast);
  }
  .ws-dialog-swatch.active {
    border-color: var(--text);
  }
  .ws-dialog-actions {
    display: flex;
    gap: var(--spacing-sm);
    justify-content: flex-end;
    margin-top: var(--spacing-md);
  }
  .ws-dialog-btn {
    padding: var(--spacing-sm) var(--spacing-md);
    border: none;
    border-radius: var(--radius-sm);
    font-size: var(--font-size-base);
    cursor: pointer;
    transition: background var(--transition-fast);
  }
  .ws-dialog-btn-cancel {
    background: var(--surface);
    color: var(--text-secondary);
  }
  .ws-dialog-btn-cancel:hover {
    background: var(--border);
  }
  .ws-dialog-btn-primary {
    background: var(--accent);
    color: var(--text-on-accent);
  }
  .ws-dialog-btn-primary:hover {
    background: var(--accent-hover);
  }
`;
