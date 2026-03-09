import { navigateBack } from './ipc.js';

export function initPaletteMode(): boolean {
  const isInPalette = new URLSearchParams(window.location.search).has('inPalette');
  if (!isInPalette) return false;

  document.documentElement.style.background = 'transparent';
  document.body.classList.add('in-palette');

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      navigateBack();
    }
  });

  return true;
}
