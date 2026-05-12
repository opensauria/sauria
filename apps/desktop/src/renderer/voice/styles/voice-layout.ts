import { css } from 'lit';

export const voiceLayoutStyles = css`
  .voice-overlay {
    position: fixed;
    inset: 0;
    z-index: var(--z-modal);
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    visibility: hidden;
    transition:
      opacity 0.2s ease-out,
      visibility 0.2s;
  }

  .voice-overlay--visible {
    opacity: 1;
    visibility: visible;
  }

  .voice-overlay--hiding {
    opacity: 0;
    transition:
      opacity 0.15s ease-in,
      visibility 0.15s;
  }

  .voice-content {
    width: 420px;
    height: 520px;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding-bottom: var(--spacing-md);
  }

  .voice-spacer {
    min-height: var(--spacing-sm);
    flex-shrink: 0;
  }

  .voice-orb {
    position: relative;
    width: 300px;
    height: 300px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .voice-backdrop {
    position: absolute;
    inset: 0;
    width: 300px;
    height: 300px;
    border-radius: 50%;
    background: radial-gradient(
      circle at center,
      color-mix(in srgb, var(--bg-solid) 80%, transparent),
      transparent 70%
    );
    pointer-events: none;
  }

  .voice-glow {
    position: absolute;
    width: 200px;
    height: 200px;
    border-radius: 50%;
    filter: blur(48px);
    background-color: color-mix(in srgb, var(--voice-orb-idle) 20%, transparent);
    transition: background-color var(--transition-normal);
    pointer-events: none;
  }

  .voice-glow--recording {
    background-color: color-mix(in srgb, var(--voice-orb-recording) 20%, transparent);
  }

  .voice-glow--processing {
    background-color: color-mix(in srgb, var(--voice-orb-processing) 20%, transparent);
  }

  .voice-glow--playing {
    background-color: color-mix(in srgb, var(--voice-orb-playing) 20%, transparent);
  }
`;
