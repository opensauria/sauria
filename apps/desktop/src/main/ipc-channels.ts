/**
 * Channel connect/disconnect IPC handler registration.
 */

import { ipcMain } from 'electron';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { paths } from '@openwind/config';
import { vaultDelete } from '@openwind/vault';
import { stopDaemon, startDaemon } from './daemon-manager';
import {
  connectTelegram,
  connectSlack,
  connectWhatsApp,
  connectDiscord,
  connectEmail,
  readConfig,
  writeConfig,
  readProfiles,
  writeProfiles,
} from './channel-connectors';

export function registerChannelHandlers(): void {
  ipcMain.handle(
    'connect-channel',
    async (_event, platform: string, credentials: Record<string, unknown>) => {
      try {
        switch (platform) {
          case 'telegram':
            return await connectTelegram(credentials);
          case 'slack':
            return await connectSlack(credentials);
          case 'whatsapp':
            return await connectWhatsApp(credentials);
          case 'discord':
            return await connectDiscord(credentials);
          case 'email':
            return await connectEmail(credentials);
          case 'gmail':
            return {
              success: false,
              error:
                'Gmail OAuth coming soon. Use Email (IMAP) with a Google App Password instead.',
            };
          default:
            return { success: false, error: `Unknown platform: ${platform}` };
        }
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Connection failed',
        };
      }
    },
  );

  ipcMain.handle('disconnect-channel', async (_event, platform: string, nodeId: string) => {
    try {
      stopDaemon();

      const vaultNames = [`channel_token_${nodeId}`];
      if (platform === 'slack') {
        vaultNames.push(`channel_signing_${nodeId}`);
      }

      for (const name of vaultNames) {
        await vaultDelete(name);
      }

      const profiles = readProfiles();
      delete profiles[nodeId];
      writeProfiles(profiles);

      if (existsSync(paths.canvas)) {
        try {
          const canvas = JSON.parse(readFileSync(paths.canvas, 'utf-8')) as Record<
            string,
            unknown
          >;
          const nodes = (canvas['nodes'] ?? []) as Array<Record<string, unknown>>;
          const node = nodes.find((n) => n['id'] === nodeId);
          if (node) {
            node['status'] = 'setup';
            node['photo'] = null;
            node['label'] = platform.charAt(0).toUpperCase() + platform.slice(1);
            node['credentials'] = '';
            node['meta'] = {};
          }
          writeFileSync(paths.canvas, JSON.stringify(canvas, null, 2), 'utf-8');
        } catch {
          // ignore canvas errors
        }
      }

      if (existsSync(paths.config)) {
        const config = JSON.parse(readFileSync(paths.config, 'utf-8')) as Record<string, unknown>;
        const channels = (config['channels'] ?? {}) as Record<string, unknown>;

        if (platform === 'telegram') {
          const remainingProfiles = readProfiles();
          const remainingUserIds: number[] = [];
          for (const [, prof] of Object.entries(remainingProfiles)) {
            const p = prof as Record<string, unknown>;
            if (p['platform'] === 'telegram' && typeof p['userId'] === 'number') {
              remainingUserIds.push(p['userId'] as number);
            }
          }
          channels['telegram'] = {
            enabled: remainingUserIds.length > 0,
            allowedUserIds: remainingUserIds,
          };
        } else if (platform === 'slack') {
          channels['slack'] = { enabled: false };
        } else if (platform === 'whatsapp') {
          channels['whatsapp'] = { enabled: false };
        } else if (platform === 'discord') {
          channels['discord'] = { enabled: false };
        } else if (platform === 'email') {
          channels['email'] = { enabled: false };
        }
        config['channels'] = channels;
        writeConfig(config);
      }

      startDaemon();
      return { success: true };
    } catch {
      return { success: false };
    }
  });
}
