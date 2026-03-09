import { css } from 'lit';

export const paletteLayoutStyles = css`
  html,
  body {
    background: transparent !important;
    height: 100% !important;
    margin: 0 !important;
    padding: 0 !important;
    overflow: hidden;
  }

  .palette {
    width: 100%;
    height: 100%;
    background: color-mix(in srgb, var(--bg-solid) 85%, transparent);
    -webkit-backdrop-filter: blur(40px);
    backdrop-filter: blur(40px);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    border-radius: var(--radius);
    border: 0.5px solid color-mix(in srgb, var(--text) 10%, transparent);
  }

  .section-header {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-sm) var(--spacing-smd) var(--spacing-xs);
    font-size: var(--font-size-micro);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    color: color-mix(in srgb, var(--text) 20%, transparent);
  }

  .section-header .section-line {
    flex: 1;
    height: 0.5px;
    background: color-mix(in srgb, var(--text) 6%, transparent);
  }

  /* -- Empty state -- */

  .empty-state {
    padding: var(--spacing-lg);
    text-align: center;
    color: color-mix(in srgb, var(--text) 25%, transparent);
    font-size: var(--font-size-label);
  }

  /* -- Footer -- */

  .footer {
    display: flex;
    align-items: center;
    gap: var(--spacing-smd);
    padding: var(--spacing-sm) var(--spacing-md);
    border-top: 0.5px solid color-mix(in srgb, var(--text) 6%, transparent);
    font-size: var(--font-size-x-small);
    color: color-mix(in srgb, var(--text) 20%, transparent);
    margin-top: auto;
    flex-shrink: 0;
  }

  .footer kbd {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 20px;
    padding: 1px var(--spacing-xs);
    background: color-mix(in srgb, var(--text) 6%, transparent);
    border: 0.5px solid color-mix(in srgb, var(--text) 10%, transparent);
    border-radius: var(--spacing-xs);
    font-size: var(--font-size-micro);
    font-family: inherit;
    color: color-mix(in srgb, var(--text) 35%, transparent);
  }

  .footer span {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
  }

  .footer .brand-label {
    font-weight: 500;
    font-size: var(--font-size-micro);
    letter-spacing: 0.5px;
    color: color-mix(in srgb, var(--text) 20%, transparent);
  }

  .settings-btn {
    width: var(--spacing-lg);
    height: var(--spacing-lg);
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    margin-right: calc(-1 * var(--spacing-xs));
    transition: background 0.1s ease;
    flex-shrink: 0;
  }

  .settings-btn:hover {
    background: var(--border);
  }

  .settings-btn.active {
    background: color-mix(in srgb, var(--text) 10%, transparent);
  }

  .settings-btn svg {
    width: var(--spacing-md);
    height: var(--spacing-md);
  }

  /* -- Spinner inline -- */

  .spinner-inline {
    display: inline-block;
    width: var(--spacing-smd);
    height: var(--spacing-smd);
    border: 2px solid color-mix(in srgb, var(--text) 15%, transparent);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
    vertical-align: middle;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
`;
