import { css } from 'lit';

export const agentDetailStyles = css`
  .detail-panel {
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
  .detail-panel.open {
    transform: translateX(0);
  }

  /* --- Header --- */
  .detail-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--spacing-md) var(--spacing-lg);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }
  .detail-title {
    font-size: var(--font-size-small);
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .detail-close-btn {
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
    transition: all var(--transition-fast);
  }
  .detail-close-btn:hover {
    background: var(--surface-hover);
    color: var(--text-secondary);
  }

  /* --- Body --- */
  .detail-body {
    padding: var(--spacing-lg);
    padding-bottom: var(--spacing-xxl);
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-lg);
    overflow-y: auto;
  }

  /* --- Identity block --- */
  .detail-identity {
    display: flex;
    align-items: center;
    gap: var(--spacing-md);
  }
  .detail-avatar {
    width: var(--spacing-xxl);
    height: var(--spacing-xxl);
    border-radius: 50%;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--surface);
    flex-shrink: 0;
  }
  .detail-avatar.owner-avatar {
    border: 2px solid var(--accent);
  }
  .detail-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .detail-avatar-initials {
    font-size: var(--font-size-base);
    font-weight: 600;
    color: var(--text);
  }
  .detail-agent-name {
    font-size: var(--font-size-heading);
    font-weight: 600;
    color: var(--text);
    line-height: 1.2;
  }
  .detail-agent-handle {
    font-size: var(--font-size-small);
    color: var(--text-dim);
    margin-top: 2px;
  }
  .detail-agent-platform {
    font-size: var(--font-size-small);
    color: var(--text-secondary);
    margin-top: 2px;
  }

  /* --- Sections --- */
  .detail-section {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }
  .detail-label {
    font-size: var(--font-size-small);
    font-weight: 500;
    color: var(--text-dim);
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  /* --- Role pills --- */
  .detail-role-pills {
    display: flex;
    gap: var(--spacing-sm);
    flex-wrap: wrap;
  }
  .detail-role-pill {
    padding: var(--spacing-sm) var(--spacing-md);
    border-radius: var(--radius-sm);
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--text-secondary);
    font-size: var(--font-size-small);
    font-weight: 500;
    cursor: pointer;
    transition: all var(--transition-fast);
  }
  .detail-role-pill:hover {
    border-color: var(--border-active);
    color: var(--text);
  }
  .detail-role-pill.active {
    background: var(--accent);
    color: var(--text-on-accent);
    border-color: var(--accent);
  }

  /* --- Autonomy bar --- */
  .detail-autonomy-bar {
    display: flex;
    position: relative;
    background: var(--surface);
    border-radius: var(--radius-sm);
    padding: var(--spacing-xs);
  }
  .detail-autonomy-seg {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--spacing-sm) var(--spacing-xs);
    cursor: pointer;
    font-size: var(--font-size-small);
    font-weight: 500;
    color: var(--text-secondary);
    position: relative;
    z-index: var(--z-above);
    transition: color var(--transition-fast);
    border-radius: var(--spacing-xs);
  }
  .detail-autonomy-seg:hover:not(.active) {
    color: var(--text);
  }
  .detail-autonomy-seg.active {
    color: var(--text-on-accent);
  }
  .detail-autonomy-highlight {
    position: absolute;
    top: var(--spacing-xs);
    bottom: var(--spacing-xs);
    background: var(--accent);
    border-radius: var(--spacing-xs);
    transition:
      left 0.25s cubic-bezier(0.4, 0, 0.2, 1),
      width 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  }

  /* --- Form inputs --- */
  agent-detail-panel input,
  agent-detail-panel textarea,
  agent-detail-panel select {
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
  agent-detail-panel textarea {
    resize: vertical;
    min-height: 80px;
    line-height: 1.5;
  }
  agent-detail-panel input:focus,
  agent-detail-panel textarea:focus,
  agent-detail-panel select:focus {
    border-color: var(--accent);
  }
  agent-detail-panel input::placeholder,
  agent-detail-panel textarea::placeholder {
    color: var(--text-dim);
  }
  agent-detail-panel select {
    appearance: none;
    -webkit-appearance: none;
    padding-right: var(--spacing-xl);
    background-image: url("data:image/svg+xml,%3Csvg width='12' height='12' viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M6 9l6 6 6-6' stroke='%23888' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right var(--spacing-smd) center;
    cursor: pointer;
  }
  agent-detail-panel select:hover {
    border-color: var(--border-active);
  }

  /* --- Toggle rows --- */
  .detail-toggle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--spacing-sm) 0;
  }
  .detail-toggle-row + .detail-toggle-row {
    border-top: 1px solid var(--border);
  }
  .detail-toggle-label {
    font-size: var(--font-size-base);
    color: var(--text);
  }

  /* --- KPI grid --- */
  .detail-kpi-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--spacing-sm);
  }
  .detail-kpi-item {
    background: var(--surface);
    border-radius: var(--radius-sm);
    padding: var(--spacing-smd) var(--spacing-md);
  }
  .detail-kpi-value {
    display: block;
    font-size: var(--font-size-heading);
    font-weight: 600;
    color: var(--text);
    line-height: 1.2;
  }
  .detail-kpi-label {
    display: block;
    font-size: var(--font-size-micro);
    color: var(--text-dim);
    margin-top: var(--spacing-xs);
  }

  /* --- Template button --- */
  .detail-template-btn {
    align-self: flex-start;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: var(--spacing-sm) var(--spacing-md);
    color: var(--text-secondary);
    font-size: var(--font-size-small);
    font-weight: 500;
    cursor: pointer;
    transition: all var(--transition-fast);
  }
  .detail-template-btn:hover {
    background: var(--surface-hover);
    border-color: var(--border-active);
  }

  /* --- Terminal button --- */
  .detail-terminal-btn {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    width: 100%;
    padding: var(--spacing-smd) var(--spacing-md);
    background: var(--accent);
    border: none;
    border-radius: var(--radius-sm);
    color: var(--text-on-accent);
    font-size: var(--font-size-base);
    font-weight: 500;
    cursor: pointer;
    transition: background var(--transition-fast);
  }
  .detail-terminal-btn:hover {
    background: var(--accent-hover);
  }
  .detail-terminal-btn img {
    width: var(--spacing-md);
    height: var(--spacing-md);
    filter: brightness(0) invert();
  }
`;
