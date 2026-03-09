import { css } from 'lit';

export const canvasCardStyles = css`
  /* --- Agent card layout, avatar, name, handle, status dot --- */

  .agent-card {
    position: absolute;
    min-width: 120px;
    width: max-content;
    max-width: 200px;
    background: color-mix(in srgb, var(--bg-solid) 92%, transparent);
    border: 1px solid var(--border);
    border-radius: var(--spacing-mld);
    padding: var(--spacing-mld) var(--spacing-smd) var(--spacing-md);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--spacing-sm);
    cursor: grab;
    transition:
      border-color var(--transition-normal),
      box-shadow var(--transition-normal);
    user-select: none;
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    z-index: var(--z-base);
    transform-style: preserve-3d;
  }

  .agent-card:hover {
    border-color: var(--border-active);
  }

  .agent-card.selected {
    border-color: var(--accent);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 24%, transparent);
  }

  .agent-card.dragging {
    cursor: grabbing;
    opacity: 0.9;
    z-index: var(--z-toast);
  }

  .agent-avatar {
    width: 56px;
    height: 56px;
    border-radius: 50%;
    background: var(--surface-light);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    overflow: hidden;
    position: relative;
  }

  .agent-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    -webkit-user-drag: none;
    pointer-events: none;
  }

  .agent-avatar svg {
    width: 28px;
    height: 28px;
  }

  .agent-status-dot {
    position: absolute;
    bottom: 0;
    right: 0;
    width: var(--spacing-smd);
    height: var(--spacing-smd);
    border-radius: 50%;
    border: 2px solid color-mix(in srgb, var(--bg-solid) 92%, transparent);
    z-index: var(--z-base);
  }

  .agent-status-dot.connected {
    background: var(--success);
  }

  .agent-status-dot.disconnected {
    background: var(--border-hover);
  }

  .agent-status-dot.error {
    background: var(--error);
  }

  .agent-name {
    font-size: var(--font-size-label);
    font-weight: 600;
    color: var(--text);
    word-break: break-word;
    white-space: normal;
    max-width: 100%;
    text-align: center;
    line-height: 1.2;
    margin-top: var(--spacing-xs);
  }

  .agent-handle {
    font-size: var(--font-size-x-small);
    font-weight: 400;
    color: var(--text-dim);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
    text-align: center;
    line-height: 1;
  }

  .agent-bot-info {
    font-size: var(--font-size-micro);
    font-weight: 400;
    color: var(--text-dim);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
    text-align: center;
    line-height: 1;
    margin-top: calc(-1 * var(--spacing-xs));
  }

  .icon-mono {
    filter: brightness(0) invert(0.5);
  }

  /* --- Platform badges --- */

  .platform-badge {
    font-size: var(--font-size-micro);
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 2px var(--spacing-sm);
    border-radius: var(--spacing-xs);
    background: var(--surface-light);
    color: var(--text-dim);
    margin-top: 2px;
  }

  .platform-badge.telegram {
    color: var(--platform-telegram);
    background: color-mix(in srgb, var(--platform-telegram) 12%, transparent);
  }

  .platform-badge.slack {
    color: var(--platform-slack);
    background: color-mix(in srgb, var(--platform-slack) 12%, transparent);
  }

  .platform-badge.whatsapp {
    color: var(--platform-whatsapp);
    background: color-mix(in srgb, var(--platform-whatsapp) 12%, transparent);
  }

  .platform-badge.discord {
    color: var(--platform-discord);
    background: color-mix(in srgb, var(--platform-discord) 12%, transparent);
  }

  .platform-badge.gmail {
    color: var(--platform-email);
    background: color-mix(in srgb, var(--platform-email) 12%, transparent);
  }

  .platform-badge.email {
    color: var(--text-secondary);
    background: var(--surface-light);
  }

  .platform-badge.owner {
    color: var(--warning);
    background: color-mix(in srgb, var(--warning) 12%, transparent);
    letter-spacing: 1px;
  }

  /* --- Gear button --- */

  .card-gear {
    position: absolute;
    top: var(--spacing-sm);
    right: var(--spacing-sm);
    width: var(--spacing-lg);
    height: var(--spacing-lg);
    border-radius: 50%;
    background: var(--border);
    border: none;
    color: var(--text-dim);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all var(--transition-fast);
    padding: 0;
    z-index: var(--z-base);
    opacity: 0;
  }

  .agent-card:hover .card-gear {
    opacity: 1;
  }

  .card-gear:hover {
    background: var(--border-active);
    color: var(--text-secondary);
    transform: scale(1.1);
  }

  .card-gear svg {
    width: var(--spacing-md);
    height: var(--spacing-md);
  }

  .card-gear img {
    width: var(--spacing-md);
    height: var(--spacing-md);
    filter: brightness(0) invert(0.35);
    transition: filter var(--transition-fast);
  }

  .card-gear:hover img {
    filter: brightness(0) invert(0.7);
  }

  /* --- Owner card variant --- */

  .agent-card.owner-card {
    min-width: 144px;
    width: max-content;
    max-width: 224px;
    padding: var(--spacing-lg) var(--spacing-md) var(--spacing-md);
    gap: var(--spacing-sm);
    border-color: color-mix(in srgb, var(--warning) 30%, transparent);
  }

  .agent-card.owner-card:hover {
    border-color: color-mix(in srgb, var(--warning) 50%, transparent);
  }

  .agent-card.owner-card.selected {
    border-color: var(--warning);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--warning) 24%, transparent);
  }

  .agent-card.owner-card .agent-avatar {
    width: 64px;
    height: 64px;
  }

  .agent-card.owner-card .agent-name {
    font-size: var(--font-size-label);
  }

  .owner-avatar {
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--warning) 20%, transparent),
      color-mix(in srgb, var(--warning) 8%, transparent)
    );
    overflow: hidden;
  }

  .owner-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 50%;
  }

  .avatar-initials {
    font-size: var(--font-size-lg);
    font-weight: 600;
    color: var(--warning);
    line-height: 1;
  }

  /* --- Setup form cards --- */

  .agent-card.setup,
  .agent-card.connecting,
  .agent-card.error-state {
    width: 280px;
    padding: var(--spacing-mld);
    border-radius: var(--radius-lg);
    align-items: stretch;
  }

  .agent-card.error-state {
    border-color: color-mix(in srgb, var(--error) 30%, transparent);
  }

  .card-setup-header {
    display: flex;
    align-items: center;
    gap: var(--spacing-smd);
    margin-bottom: var(--spacing-md);
  }

  .card-setup-header .cf-icon {
    width: var(--spacing-xl);
    height: var(--spacing-xl);
    flex-shrink: 0;
  }

  .card-setup-header .cf-icon svg,
  .card-setup-header .cf-icon img {
    width: 28px;
    height: 28px;
  }

  .card-setup-header .card-setup-title {
    font-size: var(--font-size-base);
    font-weight: 600;
    color: var(--text);
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .card-setup-close {
    flex-shrink: 0;
    width: var(--spacing-lg);
    height: var(--spacing-lg);
    border-radius: var(--radius-sm);
    border: none;
    background: transparent;
    color: var(--text-dim);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: var(--font-size-heading);
    line-height: 1;
    transition: all var(--transition-fast);
    padding: 0;
  }

  .card-setup-close:hover {
    background: var(--border);
    color: var(--text-secondary);
  }

  .card-setup-field {
    margin-bottom: var(--spacing-smd);
  }

  .card-setup-field label {
    display: block;
    font-size: var(--font-size-x-small);
    font-weight: 500;
    color: var(--text-dim);
    margin-bottom: var(--spacing-xs);
  }

  .card-setup-field input {
    width: 100%;
    padding: var(--spacing-sm) var(--spacing-smd);
    background: var(--surface-light);
    border: 1px solid var(--border-hover);
    border-radius: var(--radius-sm);
    color: var(--text);
    font-size: var(--font-size-small);
    font-family: var(--font-family-mono);
    outline: none;
    transition: border-color var(--transition-fast);
    box-sizing: border-box;
  }

  .card-setup-field input:focus {
    border-color: var(--border-active);
  }

  .card-setup-field input::placeholder {
    color: var(--text-dim);
  }

  .card-setup-field input:disabled {
    opacity: var(--opacity-disabled);
    cursor: not-allowed;
  }

  .card-setup-field .card-field-hint {
    font-size: var(--font-size-micro);
    color: var(--text-dim);
    margin-top: 2px;
  }

  .card-setup-actions {
    display: flex;
    gap: var(--spacing-sm);
    margin-top: var(--spacing-md);
  }

  .card-setup-actions button {
    padding: var(--spacing-sm) var(--spacing-md);
    border-radius: var(--radius-pill);
    font-size: var(--font-size-small);
    font-weight: 500;
    border: none;
    cursor: pointer;
    transition: all var(--transition-fast);
    flex: 1;
  }

  .card-setup-actions .btn-connect {
    background: var(--accent);
    color: var(--text-on-accent);
  }

  .card-setup-actions .btn-connect:hover {
    background: var(--accent-hover);
  }

  .card-setup-actions .btn-connect:disabled {
    opacity: var(--opacity-disabled);
    cursor: not-allowed;
  }

  .card-setup-actions .btn-cancel {
    background: var(--surface-light);
    color: var(--text-secondary);
    border: 1px solid var(--border);
  }

  .card-setup-actions .btn-cancel:hover {
    background: var(--surface-hover);
  }

  .card-setup-status {
    font-size: var(--font-size-x-small);
    margin-top: var(--spacing-sm);
    min-height: var(--spacing-md);
    display: flex;
    align-items: center;
  }

  .card-setup-status.error {
    color: var(--error);
  }

  .card-setup-status.success {
    color: var(--success);
  }

  .card-setup-status.info {
    color: var(--text-dim);
  }

  .card-spinner {
    display: inline-block;
    width: var(--spacing-md);
    height: var(--spacing-md);
    border: 2px solid var(--border-hover);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: cardSpin 0.6s linear infinite;
    vertical-align: middle;
    margin-right: var(--spacing-sm);
  }

  @keyframes cardSpin {
    to {
      transform: rotate(360deg);
    }
  }

  /* --- Card animations (flip, drop, explode) --- */

  @keyframes cardFlipIn {
    0% {
      transform: perspective(800px) rotateY(0deg);
    }
    50% {
      transform: perspective(800px) rotateY(90deg);
    }
    100% {
      transform: perspective(800px) rotateY(0deg);
    }
  }

  .agent-card.card-flip {
    animation: cardFlipIn 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  }

  @keyframes cardDropIn {
    0% {
      opacity: 0;
      transform: scale(0.3) translateY(-40px);
    }
    50% {
      opacity: 1;
      transform: scale(1.06) translateY(4px);
    }
    70% {
      transform: scale(0.97) translateY(-2px);
    }
    100% {
      opacity: 1;
      transform: scale(1) translateY(0);
    }
  }

  .agent-card.card-enter {
    animation: cardDropIn 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
  }

  @keyframes cardExplode {
    0% {
      opacity: 1;
      transform: scale(1);
      filter: blur(0);
    }
    30% {
      opacity: 0.9;
      transform: scale(1.12);
      filter: blur(0);
    }
    100% {
      opacity: 0;
      transform: scale(0.1);
      filter: blur(12px);
    }
  }

  .agent-card.card-exit {
    animation: cardExplode 0.4s cubic-bezier(0.55, 0, 1, 0.45) forwards;
    pointer-events: none;
  }

  .card-setup-gmail-hint {
    text-align: center;
    color: var(--text-dim);
    font-size: var(--font-size-small);
    margin-bottom: var(--spacing-sm);
  }

  .btn-google {
    background: #4285f4;
  }

  .btn-google:hover {
    background: #3367d6;
  }
`;
