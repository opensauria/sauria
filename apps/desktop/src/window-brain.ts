import { BrowserWindow } from 'electron';
import { loadRendererPage, SECURE_WEB_PREFERENCES } from './window-utils.js';

let win: BrowserWindow | null = null;

const BRAIN_WIDTH = 1000;
const BRAIN_HEIGHT = 700;

export function createBrainWindow(): void {
  if (win && !win.isDestroyed()) {
    win.show();
    win.focus();
    return;
  }

  win = new BrowserWindow({
    width: BRAIN_WIDTH,
    height: BRAIN_HEIGHT,
    minWidth: 720,
    minHeight: 480,
    resizable: true,
    titleBarStyle: 'hiddenInset',
    vibrancy: 'sidebar',
    backgroundColor: '#0a0a0a',
    show: false,
    webPreferences: SECURE_WEB_PREFERENCES,
  });

  loadRendererPage(win, 'brain');

  win.once('ready-to-show', () => {
    win?.show();
  });

  win.on('close', (e) => {
    e.preventDefault();
    win?.hide();
  });

  win.on('closed', () => {
    win = null;
  });
}

export function showBrainWindow(): void {
  if (!win || win.isDestroyed()) {
    createBrainWindow();
    return;
  }
  win.show();
  win.focus();
}

export function hideBrainWindow(): void {
  if (!win || !win.isVisible()) return;
  win.hide();
}

export function getBrainWindow(): BrowserWindow | null {
  if (win && win.isDestroyed()) {
    win = null;
  }
  return win;
}
