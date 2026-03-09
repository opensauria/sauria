import { css } from 'lit';

export const canvasEdgeStyles = css`
  .port {
    position: absolute;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--bg-solid);
    border: 1.5px solid var(--border-active);
    cursor: crosshair;
    transition: all var(--transition-fast);
    z-index: var(--z-dropdown);
  }

  .port:hover {
    background: var(--accent);
    border-color: var(--accent);
    transform: scale(1.4);
    box-shadow: 0 0 8px color-mix(in srgb, var(--accent) 40%, transparent);
  }

  .port-output {
    bottom: -4px;
    left: 50%;
    margin-left: -4px;
  }

  .port-input {
    top: -4px;
    left: 50%;
    margin-left: -4px;
  }

  .edge-svg {
    position: absolute;
    top: -5000px;
    left: -5000px;
    width: 10000px;
    height: 10000px;
    pointer-events: none;
    z-index: var(--z-base);
    overflow: visible;
  }

  .edge-svg .edge-line {
    stroke-width: 1.5;
    fill: none;
    stroke-linecap: round;
  }

  .edge-svg .edge-flow {
    stroke-width: 1.5;
    fill: none;
    stroke-linecap: round;
    stroke-dasharray: 40 200;
    animation: edgeFlow 2.5s linear infinite;
    filter: blur(1px);
  }

  @keyframes edgeFlow {
    from {
      stroke-dashoffset: 240;
    }
    to {
      stroke-dashoffset: 0;
    }
  }

  .edge-svg .edge-temp {
    stroke: var(--accent);
    stroke-width: 1.5;
    fill: none;
    stroke-dasharray: 6 4;
    opacity: 0.5;
  }

  .edge-svg .edge-hit {
    stroke: transparent;
    stroke-width: 16px;
    fill: none;
    pointer-events: stroke;
    cursor: pointer;
  }

  .edge-group:hover .edge-line {
    filter: brightness(1.6);
  }

  .edge-group:hover .edge-flow {
    filter: brightness(1.4) blur(1.5px);
  }

  .edge-group.edge-active .edge-line {
    stroke: var(--accent);
    stroke-width: 3;
    filter: drop-shadow(0 0 6px var(--accent));
    transition:
      stroke-width 0.3s ease,
      filter 0.3s ease;
  }

  .edge-group.edge-active .edge-flow {
    stroke: var(--accent);
    stroke-width: 2.5;
    stroke-dasharray: 20 60;
    animation: edgeFlowActive 0.8s linear infinite;
    filter: none;
    opacity: 0.9;
  }

  @keyframes edgeFlowActive {
    from {
      stroke-dashoffset: 80;
    }
    to {
      stroke-dashoffset: 0;
    }
  }
`;
