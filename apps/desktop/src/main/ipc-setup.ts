/**
 * Setup, configuration, and validation IPC handlers.
 */

import { ipcMain, shell } from 'electron';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { paths, CLOUD_PRESETS, createLocalPreset } from '@openwind/config';
import { hidePaletteWindow, navigatePaletteBack } from '../window-palette';
import { detectMcpClients, registerMcpInClient } from './mcp-detection';
import { detectLocalProviders } from './local-providers';
import {
  isDaemonRunning,
  isConfigured,
  startDaemon,
  stopDaemon,
} from './daemon-manager';

const execFileAsync = promisify(execFile);

const VALID_PROVIDERS = new Set(['anthropic', 'openai', 'google', 'ollama']);
const API_KEY_PATTERN = /^[A-Za-z0-9_\-.]+$/;

export function registerSetupHandlers(): void {
  ipcMain.handle('get-status', () => {
    let provider: string | null = null;
    let authMethod: string | null = null;

    if (existsSync(paths.config)) {
      try {
        const config = JSON.parse(readFileSync(paths.config, 'utf-8')) as Record<string, unknown>;
        const auth = (config['auth'] ?? {}) as Record<string, unknown>;
        const anthropicAuth = (auth['anthropic'] ?? {}) as Record<string, unknown>;
        if (anthropicAuth['method'] === 'oauth') {
          provider = 'Anthropic';
          authMethod = 'oauth';
        } else {
          const models = (config['models'] ?? {}) as Record<string, unknown>;
          const reasoning = (models['reasoning'] ?? {}) as Record<string, unknown>;
          if (typeof reasoning['provider'] === 'string') {
            provider = reasoning['provider'] as string;
            provider = provider.charAt(0).toUpperCase() + provider.slice(1);
            authMethod = 'api_key';
          }
        }
      } catch {
        // ignore parse errors
      }
    }

    const hasOAuthToken = existsSync(`${paths.vault}/anthropic-oauth.enc`);

    return {
      configured: isConfigured(),
      configPath: paths.config,
      home: paths.home,
      provider,
      authMethod,
      connected: hasOAuthToken || isConfigured(),
    };
  });

  ipcMain.handle('detect-clients', () => {
    return detectMcpClients().map((c) => ({ name: c.name, detected: c.detected }));
  });

  ipcMain.handle('detect-local-providers', () => detectLocalProviders());

  ipcMain.handle('validate-key', async (_event, provider: string, apiKey: string) => {
    try {
      if (!VALID_PROVIDERS.has(provider)) {
        return { valid: false, error: 'Unknown provider' };
      }
      if (!apiKey || apiKey.length > 256 || !API_KEY_PATTERN.test(apiKey)) {
        return { valid: false, error: 'Invalid API key format' };
      }

      if (provider === 'anthropic') {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-5-20250929',
            max_tokens: 1,
            messages: [{ role: 'user', content: 'hi' }],
          }),
          signal: AbortSignal.timeout(15000),
        });
        return { valid: res.ok || res.status === 400, error: res.ok ? null : await res.text() };
      }

      if (provider === 'openai') {
        const res = await fetch('https://api.openai.com/v1/models', {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(15000),
        });
        return { valid: res.ok, error: res.ok ? null : await res.text() };
      }

      if (provider === 'google') {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
          { signal: AbortSignal.timeout(15000) },
        );
        return { valid: res.ok, error: res.ok ? null : await res.text() };
      }

      return { valid: true, error: null };
    } catch (err) {
      return { valid: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  });

  ipcMain.handle(
    'configure',
    async (
      _event,
      opts: {
        mode: 'claude_desktop' | 'api_key' | 'local';
        provider: string;
        apiKey: string;
        localBaseUrl: string;
      },
    ) => {
      const { mode, provider, apiKey, localBaseUrl } = opts;
      const steps: Array<{ label: string; status: string }> = [];
      const isLocal = mode === 'local';

      try {
        for (const sub of ['logs', 'tmp', 'exports', 'vault']) {
          const dir = `${paths.home}/${sub}`;
          if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        }
        steps.push({ label: 'Directory structure', status: 'done' });
      } catch (err) {
        steps.push({
          label: 'Directory structure',
          status: `error: ${err instanceof Error ? err.message : String(err)}`,
        });
      }

      try {
        await execFileAsync('openwind', ['doctor'], { timeout: 10000 });
        steps.push({ label: 'CLI available', status: 'done' });
      } catch {
        steps.push({ label: 'CLI available', status: 'warning: openwind CLI not in PATH' });
      }

      try {
        const isLocalEngine =
          provider === 'ollama' || provider === 'lm-studio' || provider === 'open-webui';
        const models = isLocalEngine
          ? createLocalPreset(provider as 'ollama' | 'lm-studio' | 'open-webui', localBaseUrl)
          : CLOUD_PRESETS[provider] ?? CLOUD_PRESETS['anthropic'];

        const hasOAuthToken = existsSync(`${paths.vault}/anthropic-oauth.enc`);
        const authMethod = isLocal
          ? 'none'
          : mode === 'claude_desktop'
            ? hasOAuthToken
              ? 'oauth'
              : 'none'
            : 'encrypted_file';

        let existing: Record<string, unknown> = {};
        if (existsSync(paths.config)) {
          try {
            existing = JSON.parse(readFileSync(paths.config, 'utf-8')) as Record<string, unknown>;
          } catch {
            existing = {};
          }
        }

        const config = {
          models,
          auth: { [provider]: { method: authMethod } },
          budget: { dailyLimitUsd: 5, warnAtUsd: 3, preferCheap: true },
          mcp: existing['mcp'] ?? { servers: {} },
          channels: existing['channels'] ?? { telegram: { enabled: false, allowedUserIds: [] } },
        };

        writeFileSync(paths.config, JSON.stringify(config, null, 2), 'utf-8');
        steps.push({ label: 'Configuration', status: 'done' });
      } catch (err) {
        steps.push({
          label: 'Configuration',
          status: `error: ${err instanceof Error ? err.message : String(err)}`,
        });
      }

      if (apiKey && !isLocal) {
        try {
          if (!existsSync(paths.vault)) mkdirSync(paths.vault, { recursive: true });
          await execFileAsync('openwind', ['doctor'], { timeout: 10000 }).catch(() => null);
          steps.push({ label: 'Credentials stored', status: 'done' });
        } catch {
          steps.push({ label: 'Credentials stored', status: 'warning' });
        }
      }

      const clients = detectMcpClients();
      const registered: string[] = [];
      for (const client of clients) {
        const result = registerMcpInClient(client);
        if (result === 'registered' || result === 'already_registered') {
          registered.push(client.name);
        }
      }
      if (registered.length > 0) {
        steps.push({ label: `MCP: ${registered.join(', ')}`, status: 'done' });
      }

      return { steps, registered };
    },
  );

  // ─── Misc Handlers ────────────────────────────────────────────

  ipcMain.handle('open-external', (_event, url: string) => {
    if (typeof url !== 'string' || !url.startsWith('https://')) return;
    shell.openExternal(url);
  });

  ipcMain.handle('hide-palette', () => {
    hidePaletteWindow();
  });

  ipcMain.handle('navigate-back', () => {
    navigatePaletteBack();
  });

  ipcMain.handle('get-daemon-status', () => ({
    running: isDaemonRunning(),
  }));

  ipcMain.handle('start-daemon', () => {
    startDaemon();
    return { running: isDaemonRunning() };
  });

  ipcMain.handle('stop-daemon', () => {
    stopDaemon();
    return { running: false };
  });
}
