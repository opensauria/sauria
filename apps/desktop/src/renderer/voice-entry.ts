/**
 * Entry point for the standalone voice window.
 * Bootstraps the <sauria-voice> component and auto-shows it.
 */
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { adoptGlobalStyles } from './shared/styles/inject.js';
import './voice/sauria-voice.js';

adoptGlobalStyles();

const voice = document.createElement('sauria-voice') as HTMLElement & {
  toggle(): void;
  show(): void;
  hide(): void;
};
document.body.appendChild(voice);

/* Auto-show on window load */
voice.show();

/* Listen for toggle events from the Rust shortcut */
listen('voice-toggle', () => {
  voice.toggle();
});

/* When the voice component hides, also hide the native window */
listen('voice-hide', async () => {
  const win = getCurrentWindow();
  await win.hide();
});
