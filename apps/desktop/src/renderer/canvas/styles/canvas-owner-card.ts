import { css } from 'lit';

export const canvasOwnerCardStyles = css`
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
    font-size: 18px;
    font-weight: 600;
    color: var(--warning);
    line-height: 1;
  }
`;
