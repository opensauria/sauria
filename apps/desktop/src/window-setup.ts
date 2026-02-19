import { BrowserWindow } from 'electron';
import { loadRendererPage, SECURE_WEB_PREFERENCES } from './window-utils.js';

let win: BrowserWindow | null = null;

export function createSetupWindow(): void {
  if (win && !win.isDestroyed()) {
    win.show();
    win.focus();
    return;
  }

  win = new BrowserWindow({
    width: 520,
    height: 680,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    titleBarStyle: 'hiddenInset',
    vibrancy: 'sidebar',
    backgroundColor: '#0a0a0a',
    show: false,
    webPreferences: SECURE_WEB_PREFERENCES,
  });

  loadRendererPage(win, 'setup');

  win.once('ready-to-show', () => {
    win?.show();
  });

  win.on('closed', () => {
    win = null;
  });
}

export function getSetupWindow(): BrowserWindow | null {
  return win;
}
