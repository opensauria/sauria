import { css } from 'lit';

export const agentDetailStyles = css`
  :host {
    display: block;
  }
  .panel {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    width: 340px;
    max-width: 100%;
    background: var(--bg-solid);
    border-left: 1px solid var(--border);
    z-index: var(--z-modal);
    transform: translateX(100%);
    transition: transform var(--transition-normal);
    display: flex;
    flex-direction: column;
    overflow-y: auto;
  }
  .panel.open {
    transform: translateX(0);
  }
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--spacing-md);
    border-bottom: 1px solid var(--border);
  }
  .title {
    font-size: var(--font-size-base);
    font-weight: 500;
    color: var(--text);
  }
  .close-btn {
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
  .close-btn:hover {
    background: var(--surface-hover);
  }
  .body {
    padding: var(--spacing-md);
    flex: 1;
  }
  .section {
    margin-bottom: var(--spacing-md);
  }
  .label {
    display: block;
    font-size: var(--font-size-small);
    color: var(--text-secondary);
    margin-bottom: var(--spacing-xs);
  }
  .identity {
    display: flex;
    align-items: center;
    gap: var(--spacing-smd);
    margin-bottom: var(--spacing-md);
  }
  .detail-avatar {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--surface);
  }
  .detail-avatar.owner-avatar {
    border: 2px solid var(--accent);
  }
  .detail-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .avatar-initials {
    font-size: var(--font-size-small);
    color: var(--text);
  }
  .detail-agent-name {
    font-size: var(--font-size-base);
    font-weight: 500;
    color: var(--text);
  }
  .detail-agent-handle {
    font-size: var(--font-size-small);
    color: var(--text-dim);
  }
  .detail-agent-platform {
    font-size: var(--font-size-small);
    color: var(--text-secondary);
  }
  .role-pills {
    display: flex;
    gap: var(--spacing-xs);
    flex-wrap: wrap;
  }
  .role-pill {
    padding: var(--spacing-xs) var(--spacing-smd);
    border-radius: var(--radius-sm);
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--text-secondary);
    font-size: var(--font-size-small);
    cursor: pointer;
  }
  .role-pill.active {
    background: var(--accent);
    color: var(--text-on-accent);
    border-color: var(--accent);
  }
  .autonomy-bar {
    display: flex;
    position: relative;
    background: var(--surface);
    border-radius: var(--radius-sm);
    overflow: hidden;
  }
  .autonomy-seg {
    flex: 1;
    padding: var(--spacing-sm) var(--spacing-xs);
    text-align: center;
    cursor: pointer;
    font-size: var(--font-size-small);
    color: var(--text-secondary);
    position: relative;
    z-index: 1;
  }
  .autonomy-seg.active {
    color: var(--text-on-accent);
  }
  .autonomy-highlight {
    position: absolute;
    top: 0;
    bottom: 0;
    background: var(--accent);
    border-radius: var(--radius-sm);
    transition:
      left 0.25s cubic-bezier(0.4, 0, 0.2, 1),
      width 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  }
  input,
  textarea,
  select {
    width: 100%;
    box-sizing: border-box;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: var(--spacing-sm) var(--spacing-smd);
    color: var(--text);
    font-size: var(--font-size-base);
    outline: none;
  }
  textarea {
    resize: vertical;
    min-height: 80px;
  }
  input:focus,
  textarea:focus,
  select:focus {
    border-color: var(--accent);
  }
  select {
    appearance: auto;
  }
  .toggle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--spacing-sm);
  }
  .toggle-label {
    font-size: var(--font-size-base);
    color: var(--text-secondary);
  }
  .toggle-switch {
    width: 36px;
    height: 20px;
    border-radius: 10px;
    cursor: pointer;
    background: var(--surface);
    border: 1px solid var(--border);
    position: relative;
    transition: background var(--transition-fast);
  }
  .toggle-switch.active {
    background: var(--accent);
    border-color: var(--accent);
  }
  .toggle-switch::after {
    content: '';
    position: absolute;
    top: 2px;
    left: 2px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--text-on-accent);
    transition: transform var(--transition-fast);
  }
  .toggle-switch.active::after {
    transform: translateX(16px);
  }
  .kpi-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--spacing-sm);
  }
  .kpi-item {
    background: var(--surface);
    border-radius: var(--radius-sm);
    padding: var(--spacing-sm) var(--spacing-smd);
  }
  .kpi-value {
    display: block;
    font-size: var(--font-size-heading);
    font-weight: 600;
    color: var(--text);
  }
  .kpi-label {
    display: block;
    font-size: var(--font-size-micro);
    color: var(--text-secondary);
  }
  .template-btn {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: var(--spacing-xs) var(--spacing-smd);
    color: var(--text-secondary);
    font-size: var(--font-size-small);
    cursor: pointer;
    margin-top: var(--spacing-xs);
  }
  .template-btn:hover {
    background: var(--border);
  }
`;
