import { BrowserWindow, screen } from 'electron';
import { join } from 'path';

let win: BrowserWindow | null = null;

const PALETTE_WIDTH = 680;
const PALETTE_HEIGHT = 520;
const TOP_OFFSET = 200;

function isAlive(): boolean {
  return win !== null && !win.isDestroyed();
}

export function createPaletteWindow(): void {
  if (isAlive()) return;

  win = new BrowserWindow({
    width: PALETTE_WIDTH,
    height: PALETTE_HEIGHT,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    frame: false,
    transparent: true,
    hasShadow: true,
    vibrancy: 'under-window',
    visualEffectState: 'active',
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.loadFile(join(__dirname, 'ui', 'palette.html'));

  win.on('blur', () => {
    hidePaletteWindow();
  });

  win.on('closed', () => {
    win = null;
  });
}

export function showPaletteWindow(): void {
  if (!isAlive()) {
    createPaletteWindow();
  }
  if (!win) return;

  if (win.isVisible()) {
    hidePaletteWindow();
    return;
  }

  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const { x, width } = display.workArea;

  const posX = Math.round(x + (width - PALETTE_WIDTH) / 2);
  const posY = display.workArea.y + TOP_OFFSET;

  win.setPosition(posX, posY);
  win.show();
  win.focus();
  win.webContents.send('palette-show');
}

export function hidePaletteWindow(): void {
  if (!isAlive() || !win!.isVisible()) return;
  win!.hide();
}

export function sendCommandResult(text: string): void {
  if (!isAlive()) return;
  win!.webContents.send('command-result', text);
}

export function getPaletteWindow(): BrowserWindow | null {
  if (!isAlive()) return null;
  return win;
}
