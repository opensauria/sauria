import { css } from 'lit';

/* Config panel, form controls, auth toggle, and connected account styles */

export const configStyles = css`
  /* ── Config Panel ────────────────────────────── */

  .config-panel {
    position: fixed;
    top: 0;
    right: -360px;
    width: 360px;
    height: 100vh;
    background: var(--bg-solid);
    border-left: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    transition: right var(--transition-normal);
    z-index: var(--z-overlay);
  }

  .config-panel.open {
    right: 0;
  }

  .config-panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--spacing-md) var(--spacing-lg);
    border-bottom: 1px solid var(--border);
  }

  .config-panel-title {
    font-size: var(--font-size-small);
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .config-panel-close {
    width: var(--spacing-xl);
    height: var(--spacing-xl);
    border: none;
    border-radius: var(--radius-sm);
    background: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-dim);
    transition: all var(--transition-fast);
  }

  .config-panel-close:hover {
    background: var(--surface-hover);
    color: var(--text-secondary);
  }

  .config-panel-close img {
    width: var(--spacing-md);
    height: var(--spacing-md);
    filter: brightness(0) invert();
  }

  .config-panel-body {
    padding: var(--spacing-lg);
    overflow-y: auto;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
  }

  /* ── Form Controls ───────────────────────────── */

  .config-field {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
  }

  .config-label {
    font-size: var(--font-size-small);
    font-weight: 500;
    color: var(--text-dim);
  }

  .config-input {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: var(--spacing-smd) var(--spacing-sm);
    color: var(--text);
    font-size: var(--font-size-label);
    outline: none;
    transition: border-color var(--transition-fast);
  }

  .config-input:focus {
    border-color: var(--accent);
  }

  .config-input::placeholder {
    color: var(--text-dim);
  }

  .config-actions {
    display: flex;
    gap: var(--spacing-sm);
    margin-top: var(--spacing-sm);
  }

  .config-actions .btn {
    flex: 1;
  }

  .config-error {
    font-size: var(--font-size-small);
    color: var(--error);
    padding: var(--spacing-sm);
    background: color-mix(in srgb, var(--error) 8%, transparent);
    border-radius: var(--radius-sm);
  }
`;
