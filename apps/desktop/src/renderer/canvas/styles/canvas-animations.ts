import { css } from 'lit';

export const canvasAnimationStyles = css`
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
`;
