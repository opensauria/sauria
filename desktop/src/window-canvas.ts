import { BrowserWindow } from 'electron';
import { join } from 'path';

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
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.loadFile(join(__dirname, 'ui', 'canvas.html'));

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
