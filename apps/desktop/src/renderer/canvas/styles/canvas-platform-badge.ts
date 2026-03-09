import { css } from 'lit';

export const canvasPlatformBadgeStyles = css`
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
`;
