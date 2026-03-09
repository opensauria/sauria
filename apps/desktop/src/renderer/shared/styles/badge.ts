import { css } from 'lit';

export const badgeStyles = css`
  .badge {
    display: inline-block;
    font-size: var(--font-size-x-small);
    padding: var(--spacing-xs) var(--spacing-sm);
    border-radius: var(--radius-sm);
    font-weight: 500;
    flex-shrink: 0;
  }

  .badge-accent {
    color: var(--accent);
    background: color-mix(in srgb, var(--accent) 12%, transparent);
  }

  .badge-success {
    color: var(--success);
    background: color-mix(in srgb, var(--success) 12%, transparent);
  }

  .badge-dim {
    color: var(--text-dim);
    background: color-mix(in srgb, var(--text-dim) 12%, transparent);
  }

  .badge-error {
    color: var(--error);
    background: color-mix(in srgb, var(--error) 12%, transparent);
  }

  .badge-warning {
    color: var(--warning);
    background: color-mix(in srgb, var(--warning) 12%, transparent);
  }

  /* Entity type badges */

  .type-badge {
    display: inline-block;
    font-size: var(--font-size-x-small);
    padding: 2px var(--spacing-sm);
    border-radius: var(--radius-sm);
    font-weight: 500;
  }

  .type-person {
    color: var(--entity-person);
    background: color-mix(in srgb, var(--entity-person) 12%, transparent);
  }

  .type-project {
    color: var(--entity-project);
    background: color-mix(in srgb, var(--entity-project) 12%, transparent);
  }

  .type-company {
    color: var(--entity-company);
    background: color-mix(in srgb, var(--entity-company) 12%, transparent);
  }

  .type-event {
    color: var(--entity-event);
    background: color-mix(in srgb, var(--entity-event) 12%, transparent);
  }

  .type-document {
    color: var(--entity-document);
    background: color-mix(in srgb, var(--entity-document) 12%, transparent);
  }

  .type-goal {
    color: var(--entity-goal);
    background: color-mix(in srgb, var(--entity-goal) 12%, transparent);
  }

  .type-place {
    color: var(--entity-place);
    background: color-mix(in srgb, var(--entity-place) 12%, transparent);
  }

  .type-concept {
    color: var(--entity-concept);
    background: color-mix(in srgb, var(--entity-concept) 12%, transparent);
  }

  /* Observation type badges */

  .type-pattern {
    color: var(--observation-trait);
    background: color-mix(in srgb, var(--observation-trait) 12%, transparent);
  }

  .type-insight {
    color: var(--observation-preference);
    background: color-mix(in srgb, var(--observation-preference) 12%, transparent);
  }

  .type-prediction {
    color: var(--observation-fact);
    background: color-mix(in srgb, var(--observation-fact) 12%, transparent);
  }

  .type-preference {
    color: var(--observation-behavior);
    background: color-mix(in srgb, var(--observation-behavior) 12%, transparent);
  }

  .type-fact {
    color: var(--observation-skill);
    background: color-mix(in srgb, var(--observation-skill) 12%, transparent);
  }
`;
