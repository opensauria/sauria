/**
 * Palette command execution — handles commands dispatched from the palette UI.
 */

import { app, ipcMain, shell } from 'electron';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  showPaletteWindow,
  hidePaletteWindow,
  sendCommandResult,
  getPaletteWindow,
  navigatePaletteTo,
} from '../window-palette';
import { isDaemonRunning } from './daemon-manager';

const execFileAsync = promisify(execFile);
const COMMAND_TIMEOUT = 10_000;

const ALLOWED_COMMANDS = new Set([
  'status',
  'telegram',
  'settings',
  'setup',
  'audit',
  'doctor',
  'docs',
  'quit',
  'canvas',
  'brain',
]);

async function handleCommand(id: string): Promise<void> {
  if (!ALLOWED_COMMANDS.has(id)) return;

  switch (id) {
    case 'status': {
      const daemonStatus = isDaemonRunning() ? 'Running' : 'Stopped';
      sendCommandResult(`Daemon: ${daemonStatus}\n\nLoading details...`);
      try {
        const { stdout } = await execFileAsync('openwind', ['status'], {
          timeout: COMMAND_TIMEOUT,
        });
        sendCommandResult(`Daemon: ${daemonStatus}\n\n${stdout.trim()}`);
      } catch {
        sendCommandResult(`Daemon: ${daemonStatus}\n\nCLI details unavailable.`);
      }
      break;
    }
    case 'audit': {
      sendCommandResult('Loading audit log...');
      try {
        const { stdout } = await execFileAsync('openwind', ['audit', '10'], {
          timeout: COMMAND_TIMEOUT,
        });
        sendCommandResult(stdout.trim());
      } catch {
        sendCommandResult('CLI not available. Is openwind installed?');
      }
      break;
    }
    case 'doctor': {
      sendCommandResult('Running health check...');
      try {
        const { stdout } = await execFileAsync('openwind', ['doctor'], {
          timeout: COMMAND_TIMEOUT,
        });
        sendCommandResult(stdout.trim());
      } catch {
        sendCommandResult('CLI not available. Is openwind installed?');
      }
      break;
    }
    case 'telegram': {
      const paletteWin = getPaletteWindow();
      if (paletteWin) {
        paletteWin.webContents.send('show-telegram-form');
      }
      break;
    }
    case 'settings':
    case 'canvas': {
      navigatePaletteTo('canvas');
      break;
    }
    case 'setup': {
      navigatePaletteTo('setup');
      break;
    }
    case 'brain': {
      navigatePaletteTo('brain');
      break;
    }
    case 'docs': {
      hidePaletteWindow();
      shell.openExternal('https://openwind.ai/docs');
      break;
    }
    case 'quit': {
      app.quit();
      break;
    }
  }
}

export function registerCommandHandlers(): void {
  ipcMain.handle('execute-command', async (_event, id: string) => {
    await handleCommand(id);
  });
}
