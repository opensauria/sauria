/**
 * Canvas graph IPC handlers — read/write graph, owner commands, owner profile.
 */

import { ipcMain } from 'electron';
import { existsSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { paths } from '@openwind/config';
import { parseOwnerCommand } from '@openwind/ipc-protocol';
import type { CanvasGraph } from '@openwind/types';
import { createEmptyGraph } from '@openwind/types';
import { showCanvasWindow } from '../window-canvas';
import { resolveOwnerFullName, resolveOwnerPhoto } from './owner-profile';
import { isDaemonRunning } from './daemon-manager';

export function readCanvasGraph(): CanvasGraph {
  const empty = createEmptyGraph();
  if (!existsSync(paths.canvas)) return empty;
  try {
    return JSON.parse(readFileSync(paths.canvas, 'utf-8')) as CanvasGraph;
  } catch {
    return empty;
  }
}

export function writeCanvasGraph(graph: CanvasGraph): void {
  writeFileSync(paths.canvas, JSON.stringify(graph, null, 2), 'utf-8');
}

export function registerCanvasHandlers(): void {
  ipcMain.handle('get-canvas-graph', () => readCanvasGraph());

  ipcMain.handle('save-canvas-graph', (_event, graph: CanvasGraph) => {
    writeCanvasGraph(graph);
  });

  ipcMain.handle('show-canvas', () => {
    showCanvasWindow();
  });

  ipcMain.handle('execute-owner-command', async (_event, command: string) => {
    const result = parseOwnerCommand(command);

    if (result.type !== 'unknown' && 'ownerCommand' in result && isDaemonRunning()) {
      try {
        const cmdLine = JSON.stringify(result.ownerCommand) + '\n';
        appendFileSync(paths.ownerCommands, cmdLine, 'utf-8');
      } catch {
        // Best-effort — daemon may not be running
      }
    }

    return result;
  });

  ipcMain.handle('get-telegram-status', () => {
    try {
      let profiles: Record<string, unknown> = {};
      if (existsSync(paths.botProfiles)) {
        try {
          profiles = JSON.parse(readFileSync(paths.botProfiles, 'utf-8')) as Record<
            string,
            unknown
          >;
        } catch {
          profiles = {};
        }
      }

      let canvasNodes: Array<Record<string, unknown>> = [];
      if (existsSync(paths.canvas)) {
        try {
          const canvas = JSON.parse(readFileSync(paths.canvas, 'utf-8')) as Record<
            string,
            unknown
          >;
          canvasNodes = ((canvas['nodes'] ?? []) as Array<Record<string, unknown>>).filter(
            (n) => n['platform'] === 'telegram',
          );
        } catch {
          canvasNodes = [];
        }
      }

      const bots: Array<Record<string, unknown>> = [];
      for (const node of canvasNodes) {
        const nid = String(node['id'] ?? '');
        const status = String(node['status'] ?? 'setup');
        const profile = (profiles[nid] ?? null) as Record<string, unknown> | null;
        const hasToken = existsSync(join(paths.vault, `channel_token_${nid}.enc`));
        bots.push({
          nodeId: nid,
          connected: status === 'connected' && hasToken,
          label: node['label'] ?? 'Telegram Bot',
          photo: node['photo'] ?? profile?.['photo'] ?? null,
          profile,
        });
      }

      return {
        connected: bots.some((b) => b['connected']),
        bots,
      };
    } catch {
      return { connected: false, bots: [] };
    }
  });

  ipcMain.handle('get-owner-profile', () => {
    const fullName = resolveOwnerFullName();
    const photo = resolveOwnerPhoto();

    let customInstructions = '';
    const claudeMdPath = join(homedir(), '.claude', 'CLAUDE.md');
    if (existsSync(claudeMdPath)) {
      try {
        customInstructions = readFileSync(claudeMdPath, 'utf-8');
      } catch {
        /* ignore */
      }
    }

    return { fullName, photo, customInstructions };
  });
}
