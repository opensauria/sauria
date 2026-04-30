import { css } from 'lit';

export const voiceToolbarStyles = css`
  @keyframes voice-settings-in {
    from {
      transform: scale(0.5);
      opacity: 0;
    }
    to {
      transform: scale(1);
      opacity: 1;
    }
  }

  .voice-toolbar {
    display: flex;
    gap: var(--spacing-sm);
    align-items: center;
    justify-content: center;
  }

  .voice-toolbar__btn {
    width: 32px;
    height: 32px;
    border-radius: var(--radius-pill);
    border: 1px solid var(--border);
    background: var(--surface);
    backdrop-filter: blur(12px);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: var(--transition-fast);
  }

  .voice-toolbar__btn:hover {
    background: color-mix(in srgb, var(--surface-hover) 100%, transparent);
  }

  .voice-toolbar__btn:disabled {
    opacity: var(--opacity-disabled);
    cursor: not-allowed;
  }

  .voice-toolbar__icon {
    width: 13px;
    height: 13px;
    filter: brightness(0) invert();
    opacity: 0.5;
  }

  .voice-toolbar__mic--recording .voice-toolbar__icon {
    opacity: 0.8;
    filter: brightness(0) invert() sepia(1) hue-rotate(-30deg) saturate(5);
  }

  .voice-toolbar__settings {
    display: flex;
    gap: var(--spacing-smd);
    align-items: center;
    padding: var(--spacing-sm) var(--spacing-smd);
    border-radius: var(--radius-pill);
    background: var(--surface);
    backdrop-filter: blur(12px);
    border: 1px solid var(--border);
    animation: voice-settings-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  .voice-toolbar__settings-btn {
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
    display: flex;
    align-items: center;
  }

  .voice-toolbar__settings-btn:hover .voice-toolbar__icon {
    opacity: 0.8;
  }

  .voice-toolbar__settings-close .voice-toolbar__icon {
    width: 10px;
    height: 10px;
    opacity: 0.4;
  }
`;
