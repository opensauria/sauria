import { BrowserWindow } from 'electron';
import { join } from 'path';

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

export const SECURE_WEB_PREFERENCES: Electron.WebPreferences = {
  preload: join(__dirname, 'preload.js'),
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
};

export function loadRendererPage(win: BrowserWindow, page: string): void {
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    win.loadURL(`${MAIN_WINDOW_VITE_DEV_SERVER_URL}/src/renderer/${page}/index.html`);
  } else {
    win.loadFile(
      join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/src/renderer/${page}/index.html`),
    );
  }
}
