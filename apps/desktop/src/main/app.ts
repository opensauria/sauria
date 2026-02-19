/**
 * Electron main process entry point.
 *
 * Orchestrates app lifecycle, tray, global shortcuts.
 * All IPC handlers are registered from dedicated modules.
 */

import {
  app,
  Tray,
  Menu,
  nativeImage,
  shell,
  globalShortcut,
  BrowserWindow,
} from 'electron';
import { join } from 'node:path';
import { platform } from 'node:os';
import {
  createPaletteWindow,
  showPaletteWindow,
} from '../window-palette';
import { showCanvasWindow } from '../window-canvas';
import { showBrainWindow } from '../window-brain';
import { registerBrainHandlers, cleanupBrainDb } from '../ipc-brain';
import {
  isDaemonRunning,
  startDaemon,
  stopDaemon,
  startDaemonHealthCheck,
  stopDaemonHealthCheck,
  setDaemonStateChangeHandler,
} from './daemon-manager';
import { registerSetupHandlers } from './ipc-setup';
import { registerOAuthHandlers } from './ipc-oauth';
import { registerCanvasHandlers } from './ipc-canvas';
import { registerChannelHandlers } from './ipc-channels';
import { registerCommandHandlers } from './ipc-commands';

let tray: Tray | null = null;

// ─── Tray ─────────────────────────────────────────────────────────

function createTray(): void {
  const icon = nativeImage.createFromPath(join(__dirname, '..', 'assets', 'trayTemplate.png'));
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  tray.setToolTip('OpenSauria');
  updateTrayMenu();
}

function updateTrayMenu(): void {
  if (!tray) return;

  const isMac = platform() === 'darwin';
  const shortcutHint = isMac ? 'Cmd+Shift+O' : 'Ctrl+Shift+O';
  const running = isDaemonRunning();

  const contextMenu = Menu.buildFromTemplate([
    {
      label: running ? 'Daemon: Running' : 'Daemon: Stopped',
      enabled: false,
    },
    {
      label: running ? 'Stop Daemon' : 'Start Daemon',
      click: () => {
        running ? stopDaemon() : startDaemon();
      },
    },
    { type: 'separator' },
    {
      label: `Command Palette (${shortcutHint})`,
      click: () => showPaletteWindow(),
    },
    {
      label: 'Agent Canvas',
      click: () => showCanvasWindow(),
    },
    {
      label: 'Brain',
      click: () => showBrainWindow(),
    },
    { type: 'separator' },
    {
      label: 'Documentation',
      click: () => shell.openExternal('https://opensauria.ai/docs'),
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => app.quit(),
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.setToolTip(running ? 'OpenSauria — Running' : 'OpenSauria — Stopped');
}

// ─── Global Shortcut ──────────────────────────────────────────────

function registerGlobalShortcut(): void {
  const registered = globalShortcut.register('CommandOrControl+Shift+O', showPaletteWindow);
  if (!registered) {
    globalShortcut.register('Alt+Shift+O', showPaletteWindow);
  }
}

// ─── Daemon state -> tray sync ────────────────────────────────────

setDaemonStateChangeHandler(updateTrayMenu);

// ─── App Lifecycle ────────────────────────────────────────────────

app.whenReady().then(() => {
  registerBrainHandlers();
  registerSetupHandlers();
  registerOAuthHandlers();
  registerCanvasHandlers();
  registerChannelHandlers();
  registerCommandHandlers();

  createPaletteWindow();
  createTray();
  registerGlobalShortcut();
  globalShortcut.register('CommandOrControl+Shift+B', showBrainWindow);

  startDaemon();
  startDaemonHealthCheck();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      showCanvasWindow();
    }
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  stopDaemonHealthCheck();
  stopDaemon();
  cleanupBrainDb();
});

app.on('window-all-closed', () => {
  // Keep running in tray on all platforms
});
