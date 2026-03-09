import { css } from 'lit';

export const setupLayoutStyles = css`
  .setup-wrapper {
    height: 100vh;
    display: flex;
    flex-direction: column;
    background: var(--bg-solid);
  }

  .setup-header {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-md) var(--spacing-lg);
    border-bottom: 1px solid var(--border);
    -webkit-app-region: drag;
    app-region: drag;
    flex-shrink: 0;
  }

  .setup-header .palette-back {
    position: static;
    display: flex;
    z-index: auto;
    -webkit-app-region: no-drag;
    app-region: no-drag;
  }

  .setup-title {
    font-size: var(--font-size-heading);
    font-weight: 600;
    white-space: nowrap;
    -webkit-app-region: no-drag;
  }

  .container {
    padding: var(--spacing-xl);
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
  }

  /* Steps */

  .step {
    display: none;
    flex-direction: column;
    flex: 1;
    animation: fadeIn 0.3s ease;
  }

  .step.active {
    display: flex;
  }

  /* Typography */

  h1 {
    font-size: 24px;
    font-weight: 600;
    letter-spacing: -0.5px;
    margin-bottom: var(--spacing-sm);
  }

  .subtitle {
    color: var(--text-secondary);
    font-size: var(--font-size-base);
    line-height: 1.5;
    margin-bottom: var(--spacing-xl);
  }

  .brand {
    color: var(--text-dim);
    font-size: var(--font-size-label);
    letter-spacing: 2px;
    text-transform: uppercase;
    margin-bottom: var(--spacing-lg);
  }

  /* Cards */

  .cards {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
    flex: 1;
  }

  /* Input */

  .input-group {
    margin-bottom: var(--spacing-lg);
  }

  .input-group label {
    display: block;
    font-size: var(--font-size-label);
    color: var(--text-secondary);
    margin-bottom: var(--spacing-sm);
    font-weight: 500;
  }

  .input-group input {
    width: 100%;
    padding: var(--spacing-smd) var(--spacing-md);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--text);
    font-size: var(--font-size-base);
    font-family: var(--font-family-mono);
    outline: none;
    transition: border-color var(--transition-fast);
  }

  .input-group input:focus {
    border-color: var(--accent);
  }

  .input-group input::placeholder {
    color: var(--text-dim);
  }

  .input-hint {
    font-size: var(--font-size-small);
    color: var(--text-dim);
    margin-top: var(--spacing-sm);
  }

  .input-hint a {
    color: var(--accent);
    text-decoration: none;
  }

  /* Actions */

  .actions {
    margin-top: auto;
    display: flex;
    gap: var(--spacing-sm);
    padding-top: var(--spacing-lg);
  }
`;
