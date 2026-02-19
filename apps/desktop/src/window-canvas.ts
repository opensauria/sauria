import { BrowserWindow } from 'electron';
import { loadRendererPage, SECURE_WEB_PREFERENCES } from './window-utils.js';

let win: BrowserWindow | null = null;

const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 800;

export function createCanvasWindow(): void {
  if (win && !win.isDestroyed()) {
    win.show();
    win.focus();
    return;
  }

  win = new BrowserWindow({
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    minWidth: 800,
    minHeight: 600,
    resizable: true,
    titleBarStyle: 'hiddenInset',
    vibrancy: 'sidebar',
    backgroundColor: '#0a0a0a',
    show: false,
    webPreferences: SECURE_WEB_PREFERENCES,
  });

  loadRendererPage(win, 'canvas');

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

export function showCanvasWindow(): void {
  if (!win || win.isDestroyed()) {
    createCanvasWindow();
    return;
  }
  win.show();
  win.focus();
}

export function hideCanvasWindow(): void {
  if (!win || !win.isVisible()) return;
  win.hide();
}

export function getCanvasWindow(): BrowserWindow | null {
  if (win && win.isDestroyed()) {
    win = null;
  }
  return win;
}
