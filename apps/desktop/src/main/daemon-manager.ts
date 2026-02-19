/**
 * Daemon process management — spawn, kill, health check, restart.
 */

import { existsSync, readFileSync, readdirSync, mkdirSync, openSync, unlinkSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { paths } from '@opensauria/config';

let daemonProcess: ChildProcess | null = null;
let daemonRunning = false;
let daemonStarting = false;
let daemonRestarts = 0;
let healthCheckTimer: ReturnType<typeof setInterval> | null = null;

const MAX_RESTARTS = 5;

/** Callback invoked on daemon state changes. Set by app.ts. */
let onStateChange: (() => void) | null = null;

export function setDaemonStateChangeHandler(handler: () => void): void {
  onStateChange = handler;
}

function notifyStateChange(): void {
  onStateChange?.();
}

// ─── Login Shell + Node Resolution ────────────────────────────────

function resolveLoginShell(): { shell: string; args: string[] } {
  const os = platform();
  if (os === 'win32') {
    return { shell: 'cmd.exe', args: ['/c'] };
  }
  const candidates =
    os === 'darwin' ? ['/bin/zsh', '/bin/bash'] : ['/bin/bash', '/bin/zsh', '/bin/sh'];
  for (const sh of candidates) {
    if (existsSync(sh)) return { shell: sh, args: ['-lc'] };
  }
  return { shell: '/bin/sh', args: ['-lc'] };
}

function resolveNodeBin(): { nodePath: string; opensauriaPath: string } {
  const { shell, args } = resolveLoginShell();
  const whichCmd = platform() === 'win32' ? 'where' : 'which';
  try {
    const opensauriaPath = execFileSync(shell, [...args, `${whichCmd} opensauria`], {
      encoding: 'utf-8',
      timeout: 5000,
    })
      .trim()
      .split('\n')[0];
    const nodePath = execFileSync(shell, [...args, `${whichCmd} node`], {
      encoding: 'utf-8',
      timeout: 5000,
    })
      .trim()
      .split('\n')[0];
    return { nodePath, opensauriaPath };
  } catch {
    if (platform() !== 'win32') {
      const home = homedir();
      const nvmDir = join(home, '.nvm', 'versions', 'node');
      if (existsSync(nvmDir)) {
        const versions = readdirSync(nvmDir, { encoding: 'utf-8' });
        const latest = versions.sort().reverse()[0];
        if (latest) {
          const binDir = join(nvmDir, latest, 'bin');
          return {
            nodePath: join(binDir, 'node'),
            opensauriaPath: join(binDir, 'opensauria'),
          };
        }
      }
    }
    return { nodePath: 'node', opensauriaPath: 'opensauria' };
  }
}

const resolvedBins = resolveNodeBin();

// ─── Core Functions ───────────────────────────────────────────────

export function isDaemonRunning(): boolean {
  if (daemonRunning && daemonProcess !== null && !daemonProcess.killed) return true;

  const pidPath = paths.pidFile;
  if (existsSync(pidPath)) {
    const pid = parseInt(readFileSync(pidPath, 'utf-8').trim(), 10);
    if (!isNaN(pid)) {
      try {
        process.kill(pid, 0);
        return true;
      } catch {
        // Process doesn't exist — stale PID file
      }
    }
  }
  return false;
}

export function isConfigured(): boolean {
  return existsSync(paths.config);
}

export function startDaemon(): void {
  if (daemonStarting || isDaemonRunning()) return;
  daemonStarting = true;

  const logDir = paths.logs;
  if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true });

  const errFd = openSync(join(logDir, 'daemon.err'), 'a');

  daemonProcess = spawn(resolvedBins.nodePath, [resolvedBins.opensauriaPath, 'daemon'], {
    stdio: ['pipe', 'ignore', errFd],
    detached: false,
    env: { ...process.env, OPENSAURIA_HOME: paths.home },
  });

  daemonRunning = true;
  daemonStarting = false;
  daemonRestarts = 0;
  notifyStateChange();

  daemonProcess.on('exit', (code) => {
    daemonRunning = false;
    daemonProcess = null;
    notifyStateChange();

    if (code !== 0 && code !== null && daemonRestarts < MAX_RESTARTS) {
      daemonRestarts++;
      setTimeout(() => {
        if (!isDaemonRunning()) startDaemon();
      }, 3000 * daemonRestarts);
    }
  });

  daemonProcess.on('error', () => {
    daemonRunning = false;
    daemonStarting = false;
    daemonProcess = null;
    notifyStateChange();
  });
}

function killOrphanDaemon(): void {
  const pidPath = paths.pidFile;
  if (!existsSync(pidPath)) return;
  const pid = parseInt(readFileSync(pidPath, 'utf-8').trim(), 10);
  if (isNaN(pid)) return;
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    // Already dead
  }
  try {
    unlinkSync(pidPath);
  } catch {
    // Best effort
  }
}

export function restartDaemon(): void {
  if (daemonProcess && !daemonProcess.killed) {
    const oldProcess = daemonProcess;
    oldProcess.removeAllListeners('exit');
    oldProcess.kill('SIGTERM');
    daemonRunning = false;
    daemonProcess = null;
    oldProcess.on('exit', () => {
      startDaemon();
    });
    setTimeout(() => {
      if (!isDaemonRunning()) startDaemon();
    }, 3000);
  } else {
    killOrphanDaemon();
    setTimeout(() => startDaemon(), 1000);
  }
}

export function stopDaemon(): void {
  if (!daemonProcess || daemonProcess.killed) return;
  daemonProcess.kill('SIGTERM');
  daemonRunning = false;
  daemonProcess = null;
  notifyStateChange();
}

export function startDaemonHealthCheck(): void {
  if (healthCheckTimer) return;
  healthCheckTimer = setInterval(() => {
    if (!isDaemonRunning() && isConfigured()) {
      startDaemon();
    }
  }, 10_000);
}

export function stopDaemonHealthCheck(): void {
  if (healthCheckTimer) {
    clearInterval(healthCheckTimer);
    healthCheckTimer = null;
  }
}
