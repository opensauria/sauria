import { css } from 'lit';

export const brainResponsiveStyles = css`
  body.in-palette .brain-layout {
    --titlebar-h: 0px;
  }

  .in-palette .brain-sidebar {
    padding-top: var(--spacing-xxl);
  }

  @media (max-width: 900px) {
    .brain-detail {
      width: 320px;
    }
  }

  @media (max-width: 700px) {
    .brain-sidebar {
      width: 160px;
    }

    .brain-detail {
      width: 100%;
      max-width: 360px;
    }

    .brain-stats {
      flex-wrap: wrap;
      gap: var(--spacing-sm);
    }

    .brain-table td {
      max-width: 160px;
    }
  }

  @media (max-width: 500px) {
    .brain-sidebar {
      width: var(--spacing-xxl);
      overflow: hidden;
    }

    .brain-sidebar-section-label,
    .brain-nav-count {
      display: none;
    }

    .brain-nav-item {
      justify-content: center;
      padding: var(--spacing-sm);
      gap: 0;
    }

    .brain-nav-item span:not(.icon-mono) {
      display: none;
    }
  }
`;
