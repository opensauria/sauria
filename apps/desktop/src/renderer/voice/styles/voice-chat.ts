import { css } from 'lit';

export const voiceChatStyles = css`
  @keyframes voice-bubble-in {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .voice-feed {
    max-width: 340px;
    max-height: 160px;
    width: 100%;
  }

  .voice-feed__scroll {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
    overflow-y: auto;
    scrollbar-width: none;
    max-height: 160px;
    padding: var(--spacing-sm);
    mask-image: linear-gradient(to bottom, transparent 0%, white 25%, white 75%, transparent 100%);
    -webkit-mask-image: linear-gradient(
      to bottom,
      transparent 0%,
      white 25%,
      white 75%,
      transparent 100%
    );
  }

  .voice-feed__scroll::-webkit-scrollbar {
    display: none;
  }

  .voice-bubble {
    padding: var(--spacing-sm) var(--spacing-smd);
    border-radius: var(--radius);
    backdrop-filter: blur(12px);
    background: var(--surface);
    border: 1px solid var(--border);
    animation: voice-bubble-in 0.2s ease-out;
  }

  .voice-bubble__text {
    display: block;
    line-height: 1.5;
    word-break: break-word;
  }

  .voice-bubble--user {
    margin-left: auto;
    text-align: right;
    font-size: var(--font-size-small);
    color: color-mix(in srgb, var(--text) 45%, transparent);
  }

  .voice-bubble--assistant {
    margin-right: auto;
    text-align: left;
    font-size: var(--font-size-base);
    color: color-mix(in srgb, var(--text) 65%, transparent);
  }

  .voice-bubble--error {
    margin-inline: auto;
    font-size: var(--font-size-small);
    font-weight: 500;
    color: color-mix(in srgb, var(--error) 50%, transparent);
  }
`;
