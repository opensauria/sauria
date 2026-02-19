import { BrowserWindow, screen } from 'electron';
import { loadRendererPage, SECURE_WEB_PREFERENCES } from './window-utils.js';

let win: BrowserWindow | null = null;
let navigatedPage: string | null = null;

const PALETTE_WIDTH = 680;
const PALETTE_HEIGHT = 520;
const TOP_OFFSET = 200;

const PAGE_SIZES: Record<string, { width: number; height: number }> = {
  brain: { width: 1000, height: 700 },
  canvas: { width: 1200, height: 800 },
  setup: { width: 520, height: 680 },
};

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
    webPreferences: SECURE_WEB_PREFERENCES,
  });

  loadRendererPage(win, 'palette');

  win.on('blur', () => {
    if (!navigatedPage) {
      hidePaletteWindow();
    }
  });

  win.on('closed', () => {
    win = null;
    navigatedPage = null;
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

  centerPalette();
  win.show();
  win.focus();
  win.webContents.send('palette-show');
}

export function hidePaletteWindow(): void {
  if (!isAlive() || !win!.isVisible()) return;
  win!.hide();
}

const FIXED_PAGES = new Set(['setup']);

export function navigatePaletteTo(page: string): void {
  if (!isAlive()) return;

  navigatedPage = page;
  const size = PAGE_SIZES[page] ?? { width: PALETTE_WIDTH, height: PALETTE_HEIGHT };
  const isFixed = FIXED_PAGES.has(page);

  win!.setResizable(!isFixed);
  win!.setMovable(true);
  win!.setAlwaysOnTop(false);

  if (!isFixed) {
    win!.setMinimumSize(720, 480);
  } else {
    win!.setMinimumSize(size.width, size.height);
  }

  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const { x, y, width, height } = display.workArea;
  const posX = Math.round(x + (width - size.width) / 2);
  const posY = Math.round(y + (height - size.height) / 2);

  win!.setBounds({ x: posX, y: posY, width: size.width, height: size.height });
  loadRendererPage(win!, page, { inPalette: '1' });
}

export function navigatePaletteBack(): void {
  if (!isAlive() || !navigatedPage) return;

  navigatedPage = null;

  win!.setAlwaysOnTop(true);
  win!.setMinimumSize(0, 0);
  win!.setResizable(false);
  win!.setMovable(false);

  centerPalette();
  loadRendererPage(win!, 'palette');

  win!.webContents.once('did-finish-load', () => {
    win?.webContents.send('palette-show');
  });
}

function centerPalette(): void {
  if (!win) return;
  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const { x, width } = display.workArea;
  const posX = Math.round(x + (width - PALETTE_WIDTH) / 2);
  const posY = display.workArea.y + TOP_OFFSET;
  win.setBounds({ x: posX, y: posY, width: PALETTE_WIDTH, height: PALETTE_HEIGHT });
}

export function sendCommandResult(text: string): void {
  if (!isAlive()) return;
  win!.webContents.send('command-result', text);
}

export function getPaletteWindow(): BrowserWindow | null {
  if (!isAlive()) return null;
  return win;
}

export function isPaletteNavigated(): boolean {
  return navigatedPage !== null;
}
