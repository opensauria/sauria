import {
  app,
  ipcMain,
  Tray,
  Menu,
  nativeImage,
  shell,
  globalShortcut,
  BrowserWindow,
} from 'electron';
import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync, unlinkSync } from 'fs';
import { createHash, createCipheriv, pbkdf2Sync, randomBytes } from 'crypto';
import { join, dirname } from 'path';
import { homedir, platform, userInfo } from 'os';
import { execFile, execFileSync, execSync, spawn, type ChildProcess } from 'child_process';
import { promisify } from 'util';
import {
  createPaletteWindow,
  showPaletteWindow,
  hidePaletteWindow,
  sendCommandResult,
  getPaletteWindow,
} from './window-palette';
import { createCanvasWindow, showCanvasWindow } from './window-canvas';
import { createSetupWindow } from './window-setup';
import { showBrainWindow } from './window-brain';
import { registerBrainHandlers, cleanupBrainDb } from './ipc-brain';

const execFileAsync = promisify(execFile);

const OPENWIND_HOME = join(homedir(), '.openwind');
const CONFIG_PATH = join(OPENWIND_HOME, 'config.json5');
const COMMAND_TIMEOUT = 10_000;

// ─── Vault Crypto (mirrors src/security/vault-key.ts + crypto.ts) ────

function machineId(): string {
  const cacheDir = join(OPENWIND_HOME, 'vault');
  const cachePath = join(cacheDir, '.machine-id');

  if (existsSync(cachePath)) {
    const cached = readFileSync(cachePath, 'utf-8').trim();
    if (cached.length > 0) return cached;
  }

  let id: string;
  if (platform() === 'darwin') {
    try {
      const raw = execSync('ioreg -rd1 -c IOPlatformExpertDevice | grep IOPlatformUUID', {
        encoding: 'utf-8',
        timeout: 3000,
      });
      const match = raw.match(/"([A-F0-9-]{36})"/);
      id = match ? match[1] : userInfo().username;
    } catch {
      id = userInfo().username;
    }
  } else if (platform() === 'linux') {
    try {
      id = readFileSync('/etc/machine-id', 'utf-8').trim();
    } catch {
      id = userInfo().username;
    }
  } else if (platform() === 'win32') {
    try {
      const raw = execSync('reg query "HKLM\\SOFTWARE\\Microsoft\\Cryptography" /v MachineGuid', {
        encoding: 'utf-8',
        timeout: 3000,
      });
      const match = raw.match(/MachineGuid\s+REG_SZ\s+(\S+)/);
      id = match ? match[1] : userInfo().username;
    } catch {
      id = userInfo().username;
    }
  } else {
    id = userInfo().username;
  }

  if (!existsSync(cacheDir)) mkdirSync(cacheDir, { recursive: true });
  writeFileSync(cachePath, id, 'utf-8');
  return id;
}

function deriveVaultPassword(): string {
  return createHash('sha256')
    .update(`${machineId()}:${userInfo().username}:openwind-vault`)
    .digest('hex');
}

function vaultStore(name: string, value: string): void {
  const password = deriveVaultPassword();
  const salt = randomBytes(32);
  const key = pbkdf2Sync(password, salt, 256_000, 32, 'sha512');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(Buffer.from(value, 'utf-8')), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const fileData = Buffer.concat([salt, iv, authTag, encrypted]);
  const vaultDir = join(OPENWIND_HOME, 'vault');
  if (!existsSync(vaultDir)) mkdirSync(vaultDir, { recursive: true });
  const filePath = join(vaultDir, `${name}.enc`);
  writeFileSync(filePath, fileData);
  chmodSync(filePath, 0o600);
}

const CANVAS_PATH = join(OPENWIND_HOME, 'canvas.json');

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

let tray: Tray | null = null;

// ─── Daemon Management ──────────────────────────────────────────────────

let daemonProcess: ChildProcess | null = null;
let daemonRunning = false;

function isDaemonRunning(): boolean {
  if (daemonRunning && daemonProcess !== null && !daemonProcess.killed) return true;

  // Also check the PID file to prevent spawning a duplicate
  const pidPath = join(OPENWIND_HOME, 'daemon.pid');
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

function resolveNodeBin(): { nodePath: string; openwindPath: string } {
  // Electron GUI doesn't inherit shell PATH. Resolve paths explicitly.
  const { shell, args } = resolveLoginShell();
  const whichCmd = platform() === 'win32' ? 'where' : 'which';
  try {
    const openwindPath = execFileSync(shell, [...args, `${whichCmd} openwind`], {
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
    return { nodePath, openwindPath };
  } catch {
    // Fallback for common nvm setup (Unix only)
    if (platform() !== 'win32') {
      const home = homedir();
      const nvmDir = join(home, '.nvm', 'versions', 'node');
      if (existsSync(nvmDir)) {
        const versions = require('fs').readdirSync(nvmDir) as string[];
        const latest = versions.sort().reverse()[0];
        if (latest) {
          const binDir = join(nvmDir, latest, 'bin');
          return {
            nodePath: join(binDir, 'node'),
            openwindPath: join(binDir, 'openwind'),
          };
        }
      }
    }
    return { nodePath: 'node', openwindPath: 'openwind' };
  }
}

const resolvedBins = resolveNodeBin();

let daemonRestarts = 0;
const MAX_RESTARTS = 5;
let daemonStarting = false;

function startDaemon(): void {
  if (daemonStarting || isDaemonRunning()) return;
  daemonStarting = true;

  const logDir = join(OPENWIND_HOME, 'logs');
  if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true });

  const { openSync } = require('fs') as typeof import('fs');
  const errFd = openSync(join(logDir, 'daemon.err'), 'a');

  daemonProcess = spawn(resolvedBins.nodePath, [resolvedBins.openwindPath, 'daemon'], {
    stdio: ['pipe', 'ignore', errFd],
    detached: false,
    env: { ...process.env, OPENWIND_HOME },
  });

  daemonRunning = true;
  daemonStarting = false;
  daemonRestarts = 0;
  updateTrayMenu();

  daemonProcess.on('exit', (code) => {
    daemonRunning = false;
    daemonProcess = null;
    updateTrayMenu();

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
    updateTrayMenu();
  });
}

function killOrphanDaemon(): void {
  const pidPath = join(OPENWIND_HOME, 'daemon.pid');
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

function restartDaemon(): void {
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
    // Kill orphan daemon not spawned by this Electron instance
    killOrphanDaemon();
    setTimeout(() => startDaemon(), 1000);
  }
}

function stopDaemon(): void {
  if (!daemonProcess || daemonProcess.killed) return;
  daemonProcess.kill('SIGTERM');
  daemonRunning = false;
  daemonProcess = null;
  updateTrayMenu();
}

// Health check: restart daemon if it dies unexpectedly
let healthCheckTimer: ReturnType<typeof setInterval> | null = null;

function startDaemonHealthCheck(): void {
  if (healthCheckTimer) return;
  healthCheckTimer = setInterval(() => {
    if (!isDaemonRunning() && isConfigured()) {
      startDaemon();
    }
  }, 10_000);
}

function stopDaemonHealthCheck(): void {
  if (healthCheckTimer) {
    clearInterval(healthCheckTimer);
    healthCheckTimer = null;
  }
}

function isConfigured(): boolean {
  return existsSync(CONFIG_PATH);
}

function createTray(): void {
  const icon = nativeImage.createFromPath(join(__dirname, '..', 'assets', 'trayTemplate.png'));
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  tray.setToolTip('OpenWind');
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
      click: () => shell.openExternal('https://openwind.ai/docs'),
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => app.quit(),
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.setToolTip(running ? 'OpenWind — Running' : 'OpenWind — Stopped');
}

function registerGlobalShortcut(): void {
  const registered = globalShortcut.register('CommandOrControl+Shift+O', showPaletteWindow);

  if (!registered) {
    globalShortcut.register('Alt+Shift+O', showPaletteWindow);
  }
}

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
    case 'settings': {
      hidePaletteWindow();
      showCanvasWindow();
      break;
    }
    case 'setup': {
      hidePaletteWindow();
      createSetupWindow();
      break;
    }
    case 'docs': {
      hidePaletteWindow();
      shell.openExternal('https://openwind.ai/docs');
      break;
    }
    case 'canvas': {
      hidePaletteWindow();
      showCanvasWindow();
      break;
    }
    case 'brain': {
      hidePaletteWindow();
      showBrainWindow();
      break;
    }
    case 'quit': {
      app.quit();
      break;
    }
  }
}

// ─── MCP Client Detection ──────────────────────────────────────────────

interface McpClient {
  name: string;
  configPath: string;
  detected: boolean;
}

function detectMcpClients(): McpClient[] {
  const home = homedir();
  const os = platform();

  const clients: Array<{ name: string; configPath: string }> = [];

  if (os === 'darwin') {
    clients.push({
      name: 'Claude Desktop',
      configPath: join(
        home,
        'Library',
        'Application Support',
        'Claude',
        'claude_desktop_config.json',
      ),
    });
  } else if (os === 'win32') {
    clients.push({
      name: 'Claude Desktop',
      configPath: join(
        process.env['APPDATA'] ?? join(home, 'AppData', 'Roaming'),
        'Claude',
        'claude_desktop_config.json',
      ),
    });
  } else {
    clients.push({
      name: 'Claude Desktop',
      configPath: join(home, '.config', 'Claude', 'claude_desktop_config.json'),
    });
  }

  clients.push({
    name: 'Cursor',
    configPath:
      os === 'win32'
        ? join(
            process.env['APPDATA'] ?? join(home, 'AppData', 'Roaming'),
            'Cursor',
            'User',
            'globalStorage',
            'mcp.json',
          )
        : join(home, '.cursor', 'mcp.json'),
  });

  clients.push({
    name: 'Windsurf',
    configPath:
      os === 'win32'
        ? join(
            process.env['APPDATA'] ?? join(home, 'AppData', 'Roaming'),
            'Windsurf',
            'User',
            'globalStorage',
            'mcp.json',
          )
        : join(home, '.codeium', 'windsurf', 'mcp_config.json'),
  });

  return clients.map((c) => ({
    ...c,
    detected:
      existsSync(c.configPath) ||
      existsSync(dirname(c.configPath)) ||
      (os === 'darwin' && existsSync(`/Applications/${c.name.replace(' ', '')}.app`)),
  }));
}

function registerMcpInClient(client: McpClient): string {
  if (!client.detected) return 'skipped';

  let config: Record<string, unknown> = {};
  if (existsSync(client.configPath)) {
    try {
      config = JSON.parse(readFileSync(client.configPath, 'utf-8')) as Record<string, unknown>;
    } catch {
      config = {};
    }
  }

  const servers = (config['mcpServers'] ?? {}) as Record<string, unknown>;
  if (servers['openwind']) return 'already_registered';

  servers['openwind'] = { command: 'openwind', args: ['mcp-server'] };
  config['mcpServers'] = servers;

  const dir = dirname(client.configPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(client.configPath, JSON.stringify(config, null, 2) + '\n');

  return 'registered';
}

// ─── Local Provider Detection ───────────────────────────────────────────

interface LocalProvider {
  name: string;
  baseUrl: string;
  running: boolean;
}

async function detectLocalProviders(): Promise<LocalProvider[]> {
  const providers = [
    { name: 'Ollama', baseUrl: 'http://localhost:11434' },
    { name: 'LM Studio', baseUrl: 'http://localhost:1234' },
    { name: 'Open WebUI', baseUrl: 'http://localhost:3000' },
  ];

  const results: LocalProvider[] = [];
  for (const p of providers) {
    let running = false;
    try {
      const res = await fetch(p.baseUrl, { signal: AbortSignal.timeout(2000) });
      running = res.ok || res.status < 500;
    } catch {
      running = false;
    }
    results.push({ ...p, running });
  }
  return results;
}

// ─── IPC Handlers ──────────────────────────────────────────────────────

ipcMain.handle('get-status', () => {
  let provider: string | null = null;
  let authMethod: string | null = null;

  if (existsSync(CONFIG_PATH)) {
    try {
      const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8')) as Record<string, unknown>;
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

  // Check if OAuth token file exists
  const hasOAuthToken = existsSync(join(OPENWIND_HOME, 'vault', 'anthropic-oauth.enc'));

  return {
    configured: isConfigured(),
    configPath: CONFIG_PATH,
    home: OPENWIND_HOME,
    provider,
    authMethod,
    connected: hasOAuthToken || isConfigured(),
  };
});

ipcMain.handle('detect-clients', () => {
  const clients = detectMcpClients();
  return clients.map((c) => ({
    name: c.name,
    detected: c.detected,
  }));
});

ipcMain.handle('detect-local-providers', async () => {
  return await detectLocalProviders();
});

const VALID_PROVIDERS = new Set(['anthropic', 'openai', 'google', 'ollama']);
const API_KEY_PATTERN = /^[A-Za-z0-9_\-.]+$/;

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
      return {
        valid: res.ok || res.status === 400,
        error: res.ok ? null : await res.text(),
      };
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
    return {
      valid: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
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
        const dir = join(OPENWIND_HOME, sub);
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
      steps.push({
        label: 'CLI available',
        status: 'warning: openwind CLI not in PATH',
      });
    }

    try {
      const presets: Record<
        string,
        Record<string, { provider: string; model: string; baseUrl?: string }>
      > = {
        anthropic: {
          extraction: { provider: 'google', model: 'gemini-2.5-flash' },
          reasoning: { provider: 'anthropic', model: 'claude-sonnet-4-5' },
          deep: { provider: 'anthropic', model: 'claude-opus-4-6' },
          embeddings: { provider: 'local', model: 'all-MiniLM-L6-v2' },
        },
        openai: {
          extraction: { provider: 'openai', model: 'gpt-4o-mini' },
          reasoning: { provider: 'openai', model: 'gpt-4o' },
          deep: { provider: 'openai', model: 'gpt-4o' },
          embeddings: { provider: 'local', model: 'all-MiniLM-L6-v2' },
        },
        google: {
          extraction: { provider: 'google', model: 'gemini-2.5-flash' },
          reasoning: { provider: 'google', model: 'gemini-2.5-pro' },
          deep: { provider: 'google', model: 'gemini-2.5-pro' },
          embeddings: { provider: 'local', model: 'all-MiniLM-L6-v2' },
        },
        ollama: {
          extraction: {
            provider: 'ollama',
            model: 'llama3.2',
            baseUrl: localBaseUrl,
          },
          reasoning: {
            provider: 'ollama',
            model: 'llama3.2',
            baseUrl: localBaseUrl,
          },
          deep: {
            provider: 'ollama',
            model: 'llama3.2',
            baseUrl: localBaseUrl,
          },
          embeddings: { provider: 'local', model: 'all-MiniLM-L6-v2' },
        },
        'lm-studio': {
          extraction: {
            provider: 'openai',
            model: 'lm-studio',
            baseUrl: localBaseUrl,
          },
          reasoning: {
            provider: 'openai',
            model: 'lm-studio',
            baseUrl: localBaseUrl,
          },
          deep: {
            provider: 'openai',
            model: 'lm-studio',
            baseUrl: localBaseUrl,
          },
          embeddings: { provider: 'local', model: 'all-MiniLM-L6-v2' },
        },
        'open-webui': {
          extraction: {
            provider: 'openai',
            model: 'default',
            baseUrl: localBaseUrl,
          },
          reasoning: {
            provider: 'openai',
            model: 'default',
            baseUrl: localBaseUrl,
          },
          deep: {
            provider: 'openai',
            model: 'default',
            baseUrl: localBaseUrl,
          },
          embeddings: { provider: 'local', model: 'all-MiniLM-L6-v2' },
        },
      };

      // OAuth tokens may have been stored by complete-oauth before configure is called
      const hasOAuthToken = existsSync(join(OPENWIND_HOME, 'vault', 'anthropic-oauth.enc'));
      const authMethod = isLocal
        ? 'none'
        : mode === 'claude_desktop'
          ? hasOAuthToken
            ? 'oauth'
            : 'none'
          : 'encrypted_file';

      // Preserve existing settings (channels, mcp) when reconfiguring
      let existing: Record<string, unknown> = {};
      if (existsSync(CONFIG_PATH)) {
        try {
          existing = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8')) as Record<string, unknown>;
        } catch {
          existing = {};
        }
      }

      const config = {
        models: presets[provider] ?? presets['anthropic'],
        auth: { [provider]: { method: authMethod } },
        budget: { dailyLimitUsd: 5, warnAtUsd: 3, preferCheap: true },
        mcp: existing['mcp'] ?? { servers: {} },
        channels: existing['channels'] ?? { telegram: { enabled: false, allowedUserIds: [] } },
      };

      writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
      steps.push({ label: 'Configuration', status: 'done' });
    } catch (err) {
      steps.push({
        label: 'Configuration',
        status: `error: ${err instanceof Error ? err.message : String(err)}`,
      });
    }

    if (apiKey && !isLocal) {
      try {
        const vaultDir = join(OPENWIND_HOME, 'vault');
        if (!existsSync(vaultDir)) mkdirSync(vaultDir, { recursive: true });
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
      steps.push({
        label: `MCP: ${registered.join(', ')}`,
        status: 'done',
      });
    }

    return { steps, registered };
  },
);

// ─── OAuth Flow (PKCE with official redirect URI) ───────────────────────

const ANTHROPIC_OAUTH = {
  authorizeUrl: 'https://claude.ai/oauth/authorize',
  tokenUrl: 'https://platform.claude.com/v1/oauth/token',
  clientId: '9d1c250a-e61b-44d9-88ed-5944d1962f5e',
  scopes: 'user:inference user:profile',
  redirectUri: 'https://platform.claude.com/oauth/code/callback',
} as const;

let pendingOAuthVerifier: string | null = null;
let pendingOAuthState: string | null = null;

ipcMain.handle('start-oauth', () => {
  const verifier = randomBytes(48).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const state = randomBytes(16).toString('hex');
  pendingOAuthVerifier = verifier;
  pendingOAuthState = state;

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: ANTHROPIC_OAUTH.clientId,
    redirect_uri: ANTHROPIC_OAUTH.redirectUri,
    scope: ANTHROPIC_OAUTH.scopes,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
  });
  const url = `${ANTHROPIC_OAUTH.authorizeUrl}?${params.toString()}`;
  shell.openExternal(url);
  return { started: true };
});

ipcMain.handle('complete-oauth', async (_event, code: string) => {
  if (!pendingOAuthVerifier) {
    return { success: false, error: 'No pending OAuth flow. Click "Sign in" first.' };
  }

  try {
    // Anthropic returns code in format "code#state" — split to extract both
    const parts = code.split('#');
    const actualCode = parts[0];
    const codeState = parts[1] ?? pendingOAuthState;
    const verifier = pendingOAuthVerifier;
    pendingOAuthVerifier = null;
    pendingOAuthState = null;

    const tokenRes = await fetch(ANTHROPIC_OAUTH.tokenUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: ANTHROPIC_OAUTH.clientId,
        code: actualCode,
        state: codeState,
        redirect_uri: ANTHROPIC_OAUTH.redirectUri,
        code_verifier: verifier,
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      console.error('[OAuth] Token exchange failed:', tokenRes.status, text.slice(0, 500));
      return {
        success: false,
        error: `Token exchange failed (${tokenRes.status}): ${text.slice(0, 200)}`,
      };
    }

    const tokens = (await tokenRes.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };

    const credential = JSON.stringify({
      kind: 'oauth',
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: Date.now() + tokens.expires_in * 1000,
    });
    vaultStore('anthropic-oauth', credential);

    // Update config to use oauth auth method
    let config: Record<string, unknown> = {};
    if (existsSync(CONFIG_PATH)) {
      try {
        config = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8')) as Record<string, unknown>;
      } catch {
        config = {};
      }
    }
    config['auth'] = { anthropic: { method: 'oauth' } };
    writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');

    restartDaemon();

    return { success: true };
  } catch (err) {
    pendingOAuthVerifier = null;
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
});

ipcMain.handle('open-external', (_event, url: string) => {
  if (typeof url !== 'string' || !url.startsWith('https://')) return;
  shell.openExternal(url);
});

ipcMain.handle('execute-command', async (_event, id: string) => {
  await handleCommand(id);
});

ipcMain.handle('hide-palette', () => {
  hidePaletteWindow();
});

ipcMain.handle('get-telegram-status', () => {
  try {
    const profilePath = join(OPENWIND_HOME, 'bot-profiles.json');
    let profiles: Record<string, unknown> = {};
    if (existsSync(profilePath)) {
      try {
        profiles = JSON.parse(readFileSync(profilePath, 'utf-8')) as Record<string, unknown>;
      } catch {
        profiles = {};
      }
    }

    // Read canvas graph to find telegram nodes
    const canvasPath = join(OPENWIND_HOME, 'canvas.json');
    let canvasNodes: Array<Record<string, unknown>> = [];
    if (existsSync(canvasPath)) {
      try {
        const canvas = JSON.parse(readFileSync(canvasPath, 'utf-8')) as Record<string, unknown>;
        canvasNodes = ((canvas['nodes'] ?? []) as Array<Record<string, unknown>>).filter(
          (n) => n['platform'] === 'telegram',
        );
      } catch {
        canvasNodes = [];
      }
    }

    // Build bots list from canvas nodes + their per-node profiles
    const bots: Array<Record<string, unknown>> = [];
    for (const node of canvasNodes) {
      const nid = String(node['id'] ?? '');
      const status = String(node['status'] ?? 'setup');
      const profile = (profiles[nid] ?? null) as Record<string, unknown> | null;
      const hasToken = existsSync(join(OPENWIND_HOME, 'vault', `channel_token_${nid}.enc`));
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

// ─── Owner Profile ──────────────────────────────────────────────────────

function resolveOwnerFullName(): string {
  const fallback = userInfo().username;
  try {
    const os = platform();
    if (os === 'darwin') {
      const name = execFileSync('/usr/bin/id', ['-F'], {
        encoding: 'utf-8',
        timeout: 3000,
      }).trim();
      if (name) return name;
    } else if (os === 'linux') {
      const gecos = execFileSync('/usr/bin/getent', ['passwd', fallback], {
        encoding: 'utf-8',
        timeout: 3000,
      }).trim();
      const field = gecos.split(':')[4]?.split(',')[0]?.trim();
      if (field) return field;
    } else if (os === 'win32') {
      const raw = execFileSync('net', ['user', fallback], {
        encoding: 'utf-8',
        timeout: 3000,
      });
      const match = raw.match(/Full Name\s+(.*)/i);
      const name = match?.[1]?.trim();
      if (name) return name;
    }
  } catch {
    /* fallback to username */
  }
  return fallback;
}

function resolveOwnerPhoto(): string | null {
  try {
    const os = platform();

    if (os === 'darwin') {
      const raw = execFileSync(
        '/usr/bin/dscl',
        ['.', '-read', `/Users/${userInfo().username}`, 'JPEGPhoto'],
        {
          encoding: 'utf-8',
          timeout: 5000,
          maxBuffer: 2 * 1024 * 1024,
        },
      );
      const hex = raw.split('\n').slice(1).join('').replace(/\s+/g, '');
      if (hex.length > 0) {
        return `data:image/jpeg;base64,${Buffer.from(hex, 'hex').toString('base64')}`;
      }
    } else if (os === 'linux') {
      const facePath = join(homedir(), '.face');
      if (existsSync(facePath)) {
        const buf = readFileSync(facePath);
        if (buf.length > 0) {
          const isPng = buf[0] === 0x89 && buf[1] === 0x50;
          const mime = isPng ? 'image/png' : 'image/jpeg';
          return `data:${mime};base64,${buf.toString('base64')}`;
        }
      }
    } else if (os === 'win32') {
      const picDir = join(
        homedir(),
        'AppData',
        'Roaming',
        'Microsoft',
        'Windows',
        'AccountPictures',
      );
      if (existsSync(picDir)) {
        const raw = execFileSync(
          'powershell',
          [
            '-NoProfile',
            '-Command',
            `Get-ChildItem '${picDir}' -Filter *.accountpicture-ms | Sort-Object Length -Descending | Select-Object -First 1 -ExpandProperty FullName`,
          ],
          { encoding: 'utf-8', timeout: 5000 },
        ).trim();
        if (raw && existsSync(raw)) {
          const buf = readFileSync(raw);
          const jpegStart = buf.indexOf(Buffer.from([0xff, 0xd8, 0xff]));
          if (jpegStart >= 0) {
            const jpegEnd = buf.indexOf(Buffer.from([0xff, 0xd9]), jpegStart);
            if (jpegEnd >= 0) {
              const jpeg = buf.subarray(jpegStart, jpegEnd + 2);
              return `data:image/jpeg;base64,${jpeg.toString('base64')}`;
            }
          }
        }
      }
    }
  } catch {
    /* no profile photo */
  }
  return null;
}

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

// ─── Canvas Graph Persistence ───────────────────────────────────────────

interface CanvasNode {
  id: string;
  platform: 'telegram' | 'slack' | 'whatsapp' | 'discord' | 'email';
  label: string;
  photo: string | null;
  position: { x: number; y: number };
  status: 'connected' | 'disconnected' | 'error' | 'setup';
  credentials: string;
  meta: Record<string, string>;
  workspaceId?: string | null;
  role?: 'lead' | 'specialist' | 'observer' | 'bridge' | 'assistant';
  autonomy?: 'full' | 'supervised' | 'approval' | 'manual';
  instructions?: string;
}

interface CanvasEdge {
  id: string;
  from: string;
  to: string;
  label?: string;
  edgeType?: 'intra_workspace' | 'cross_workspace' | 'manual';
  rules?: Array<{
    type: 'always' | 'keyword' | 'priority' | 'llm_decided';
    condition?: string;
    action: 'forward' | 'assign' | 'notify' | 'send_to_all';
  }>;
}

interface CanvasWorkspace {
  id: string;
  name: string;
  color: string;
  purpose: string;
  topics: string[];
  budget: number;
  position: { x: number; y: number };
  size: { w: number; h: number };
  checkpoints?: Array<{
    condition: 'between_teams' | 'high_cost' | 'external_action';
    approverChannel: string;
  }>;
  groups?: Array<{
    platform: string;
    groupId: string;
    name: string;
    ownerMemberId: string;
    autoCreated: boolean;
  }>;
}

interface CanvasGraph {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  workspaces: CanvasWorkspace[];
  viewport: { x: number; y: number; zoom: number };
}

function readCanvasGraph(): CanvasGraph {
  const empty: CanvasGraph = {
    nodes: [],
    edges: [],
    workspaces: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
  if (!existsSync(CANVAS_PATH)) return empty;
  try {
    return JSON.parse(readFileSync(CANVAS_PATH, 'utf-8')) as CanvasGraph;
  } catch {
    return empty;
  }
}

function writeCanvasGraph(graph: CanvasGraph): void {
  writeFileSync(CANVAS_PATH, JSON.stringify(graph, null, 2), 'utf-8');
}

ipcMain.handle('get-canvas-graph', () => readCanvasGraph());

ipcMain.handle('save-canvas-graph', (_event, graph: CanvasGraph) => {
  writeCanvasGraph(graph);
});

ipcMain.handle('show-canvas', () => {
  showCanvasWindow();
});

ipcMain.handle('execute-owner-command', async (_event, command: string) => {
  const trimmed = command.trim();
  if (!trimmed) {
    return { parsed: true, type: 'unknown', target: null, message: trimmed };
  }

  type ParsedCommand = {
    parsed: boolean;
    type: string;
    target: string | null;
    message: string;
    ownerCommand?: Record<string, unknown>;
  };

  let result: ParsedCommand | null = null;

  /* /promote @agent level */
  const promoteMatch = trimmed.match(/^\/promote\s+@(\S+)\s+(full|supervised|approval|manual)$/i);
  if (promoteMatch) {
    const cmd = {
      type: 'promote',
      agentId: promoteMatch[1],
      newAutonomy: promoteMatch[2]?.toLowerCase(),
    };
    result = {
      parsed: true,
      type: 'promote',
      target: promoteMatch[1] ?? null,
      message: promoteMatch[2] ?? '',
      ownerCommand: cmd,
    };
  }

  /* /reassign @agent #workspace */
  if (!result) {
    const reassignMatch = trimmed.match(/^\/reassign\s+@(\S+)\s+#(\S+)$/i);
    if (reassignMatch) {
      const cmd = { type: 'reassign', agentId: reassignMatch[1], newWorkspaceId: reassignMatch[2] };
      result = {
        parsed: true,
        type: 'reassign',
        target: reassignMatch[1] ?? null,
        message: reassignMatch[2] ?? '',
        ownerCommand: cmd,
      };
    }
  }

  /* /pause #workspace */
  if (!result) {
    const pauseMatch = trimmed.match(/^\/pause\s+#(\S+)$/i);
    if (pauseMatch) {
      const cmd = { type: 'pause', workspaceId: pauseMatch[1] };
      result = {
        parsed: true,
        type: 'pause',
        target: pauseMatch[1] ?? null,
        message: '',
        ownerCommand: cmd,
      };
    }
  }

  /* /review @agent */
  if (!result) {
    const reviewMatch = trimmed.match(/^\/review\s+@(\S+)$/i);
    if (reviewMatch) {
      const cmd = { type: 'review', agentId: reviewMatch[1] };
      result = {
        parsed: true,
        type: 'review',
        target: reviewMatch[1] ?? null,
        message: '',
        ownerCommand: cmd,
      };
    }
  }

  /* /hire platform #workspace role */
  if (!result) {
    const hireMatch = trimmed.match(/^\/hire\s+(\S+)\s+#(\S+)\s+(\S+)$/i);
    if (hireMatch) {
      const cmd = {
        type: 'hire',
        platform: hireMatch[1],
        workspace: hireMatch[2],
        role: hireMatch[3],
      };
      result = {
        parsed: true,
        type: 'hire',
        target: hireMatch[2] ?? null,
        message: `${hireMatch[1] ?? ''} ${hireMatch[3] ?? ''}`,
        ownerCommand: cmd,
      };
    }
  }

  /* /fire @agent */
  if (!result) {
    const fireMatch = trimmed.match(/^\/fire\s+@(\S+)$/i);
    if (fireMatch) {
      const cmd = { type: 'fire', agentId: fireMatch[1] };
      result = {
        parsed: true,
        type: 'fire',
        target: fireMatch[1] ?? null,
        message: '',
        ownerCommand: cmd,
      };
    }
  }

  /* @name rest → instruct agent */
  if (!result) {
    const agentMatch = trimmed.match(/^@(\S+)\s*(.*)/s);
    if (agentMatch) {
      const cmd = { type: 'instruct', agentId: agentMatch[1], instruction: agentMatch[2] ?? '' };
      result = {
        parsed: true,
        type: 'instruct',
        target: agentMatch[1] ?? null,
        message: agentMatch[2] ?? '',
        ownerCommand: cmd,
      };
    }
  }

  /* #name rest → broadcast to workspace */
  if (!result) {
    const wsMatch = trimmed.match(/^#(\S+)\s*(.*)/s);
    if (wsMatch) {
      const cmd = { type: 'broadcast', message: wsMatch[2] ?? '' };
      result = {
        parsed: true,
        type: 'broadcast',
        target: wsMatch[1] ?? null,
        message: wsMatch[2] ?? '',
        ownerCommand: cmd,
      };
    }
  }

  if (!result) {
    return { parsed: true, type: 'unknown', target: null, message: trimmed };
  }

  // Write owner command to JSONL file for daemon to pick up
  if (result.ownerCommand && isDaemonRunning()) {
    try {
      const cmdLine = JSON.stringify(result.ownerCommand) + '\n';
      const { appendFileSync } = require('fs') as typeof import('fs');
      const cmdPath = join(OPENWIND_HOME, 'owner-commands.jsonl');
      appendFileSync(cmdPath, cmdLine, 'utf-8');
    } catch {
      // Best-effort — daemon may not be running
    }
  }

  return result;
});

// ─── Generalized Channel Connection ────────────────────────────────────

ipcMain.handle(
  'connect-channel',
  async (_event, platform: string, credentials: Record<string, unknown>) => {
    try {
      if (platform === 'telegram') {
        const token = String(credentials['token'] ?? '');
        const userId = Number(credentials['userId']);
        if (!token || !Number.isFinite(userId) || userId <= 0) {
          return { success: false, error: 'Invalid credentials' };
        }

        const tgApi = `https://api.telegram.org/bot${token}`;
        const res = await fetch(`${tgApi}/getMe`, { signal: AbortSignal.timeout(10_000) });
        const body = (await res.json()) as {
          ok: boolean;
          result?: { id: number; username?: string; first_name: string };
        };

        if (!body.ok || !body.result) {
          return { success: false, error: 'Invalid bot token' };
        }

        const { id: botId, username, first_name: firstName } = body.result;
        const botUsername = username ?? firstName;

        // Fetch bot profile photo
        let photoBase64: string | null = null;
        try {
          const photosRes = await fetch(
            `${tgApi}/getUserProfilePhotos?user_id=${String(botId)}&limit=1`,
            { signal: AbortSignal.timeout(10_000) },
          );
          const photosBody = (await photosRes.json()) as {
            ok: boolean;
            result?: { photos: Array<Array<{ file_id: string; width: number }>> };
          };

          if (photosBody.ok && photosBody.result && photosBody.result.photos.length > 0) {
            const sizes = photosBody.result.photos[0];
            const smallest = sizes?.reduce((a, b) => (a.width < b.width ? a : b));
            if (smallest) {
              const fileRes = await fetch(`${tgApi}/getFile?file_id=${smallest.file_id}`, {
                signal: AbortSignal.timeout(10_000),
              });
              const fileBody = (await fileRes.json()) as {
                ok: boolean;
                result?: { file_path: string };
              };
              if (fileBody.ok && fileBody.result?.file_path) {
                const imgRes = await fetch(
                  `https://api.telegram.org/file/bot${token}/${fileBody.result.file_path}`,
                  { signal: AbortSignal.timeout(10_000) },
                );
                const imgBuf = Buffer.from(await imgRes.arrayBuffer());
                photoBase64 = `data:image/jpeg;base64,${imgBuf.toString('base64')}`;
              }
            }
          }
        } catch {
          // Photo fetch is best-effort
        }

        // Generate nodeId if not provided (palette flow creates canvas node)
        let nodeId = credentials['nodeId'] ? String(credentials['nodeId']) : null;
        if (!nodeId) {
          nodeId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
          // Create canvas node
          const canvasPath = join(OPENWIND_HOME, 'canvas.json');
          let canvas: Record<string, unknown> = { nodes: [], edges: [], workspaces: [] };
          if (existsSync(canvasPath)) {
            try {
              canvas = JSON.parse(readFileSync(canvasPath, 'utf-8')) as Record<string, unknown>;
            } catch {
              canvas = { nodes: [], edges: [], workspaces: [] };
            }
          }
          const nodes = (canvas['nodes'] ?? []) as Array<Record<string, unknown>>;
          nodes.push({
            id: nodeId,
            platform: 'telegram',
            label: `@${botUsername}`,
            photo: photoBase64,
            position: { x: 200, y: 200 },
            status: 'connected',
            credentials: `channel_token_${nodeId}`,
            meta: {
              botId: String(botId),
              userId: String(userId),
              firstName,
            },
          });
          canvas['nodes'] = nodes;
          writeFileSync(canvasPath, JSON.stringify(canvas, null, 2), 'utf-8');
        }

        // Store token per-node in vault
        vaultStore(`channel_token_${nodeId}`, token);

        // Store bot profile keyed by nodeId
        const profilePath = join(OPENWIND_HOME, 'bot-profiles.json');
        let profiles: Record<string, unknown> = {};
        if (existsSync(profilePath)) {
          try {
            profiles = JSON.parse(readFileSync(profilePath, 'utf-8')) as Record<string, unknown>;
          } catch {
            profiles = {};
          }
        }
        profiles[nodeId] = {
          platform: 'telegram',
          botId,
          username: botUsername,
          firstName,
          photo: photoBase64,
          userId,
          connectedAt: new Date().toISOString(),
        };
        writeFileSync(profilePath, JSON.stringify(profiles, null, 2), 'utf-8');

        // Update config — aggregate userIds from all connected telegram bots
        let config: Record<string, unknown> = {};
        if (existsSync(CONFIG_PATH)) {
          try {
            config = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8')) as Record<string, unknown>;
          } catch {
            config = {};
          }
        }
        const allUserIds = new Set<number>([userId]);
        for (const [, prof] of Object.entries(profiles)) {
          const p = prof as Record<string, unknown>;
          if (p['platform'] === 'telegram' && typeof p['userId'] === 'number') {
            allUserIds.add(p['userId'] as number);
          }
        }
        const channels = (config['channels'] ?? {}) as Record<string, unknown>;
        channels['telegram'] = { enabled: true, allowedUserIds: [...allUserIds] };
        config['channels'] = channels;
        writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');

        restartDaemon();

        return { success: true, botUsername, firstName, photo: photoBase64, botId, nodeId };
      }

      if (platform === 'slack') {
        const token = String(credentials['token'] ?? '');
        const signingSecret = String(credentials['signingSecret'] ?? '');
        if (!token || !signingSecret) {
          return { success: false, error: 'Bot token and signing secret required' };
        }

        const res = await fetch('https://slack.com/api/auth.test', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          signal: AbortSignal.timeout(10_000),
        });
        const body = (await res.json()) as {
          ok: boolean;
          error?: string;
          team_id?: string;
          team?: string;
          user_id?: string;
          bot_id?: string;
        };

        if (!body.ok) {
          return { success: false, error: body.error ?? 'Invalid Slack credentials' };
        }

        vaultStore('slack_bot_token', token);
        vaultStore('slack_signing_secret', signingSecret);
        const slackNodeId = credentials['nodeId'] ? String(credentials['nodeId']) : null;
        if (slackNodeId) {
          vaultStore(`channel_token_${slackNodeId}`, token);
          vaultStore(`channel_signing_${slackNodeId}`, signingSecret);
        }

        let config: Record<string, unknown> = {};
        if (existsSync(CONFIG_PATH)) {
          try {
            config = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8')) as Record<string, unknown>;
          } catch {
            config = {};
          }
        }
        const channels = (config['channels'] ?? {}) as Record<string, unknown>;
        channels['slack'] = {
          enabled: true,
          workspaceId: body.team_id ?? '',
          botUserId: body.user_id ?? '',
        };
        config['channels'] = channels;
        writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');

        restartDaemon();

        return {
          success: true,
          teamName: body.team ?? 'Slack',
          teamId: body.team_id ?? '',
          botUserId: body.user_id ?? '',
        };
      }

      if (platform === 'whatsapp') {
        const phoneNumberId = String(credentials['phoneNumberId'] ?? '');
        const accessToken = String(credentials['accessToken'] ?? '');
        if (!phoneNumberId || !accessToken) {
          return { success: false, error: 'Phone number ID and access token required' };
        }

        const res = await fetch(`https://graph.facebook.com/v18.0/${phoneNumberId}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: AbortSignal.timeout(10_000),
        });
        const body = (await res.json()) as {
          id?: string;
          display_phone_number?: string;
          verified_name?: string;
          error?: { message: string };
        };

        if (body.error) {
          return { success: false, error: body.error.message };
        }

        vaultStore('whatsapp_access_token', accessToken);
        const waNodeId = credentials['nodeId'] ? String(credentials['nodeId']) : null;
        if (waNodeId) {
          vaultStore(`channel_token_${waNodeId}`, accessToken);
        }

        // Store webhook credentials for daemon
        const appSecret = String(credentials['appSecret'] ?? '');
        if (appSecret) {
          vaultStore('whatsapp_app_secret', appSecret);
          if (waNodeId) {
            vaultStore(`whatsapp_app_secret_${waNodeId}`, appSecret);
          }
        }
        const verifyToken = randomBytes(16).toString('hex');
        vaultStore('whatsapp_verify_token', verifyToken);
        if (waNodeId) {
          vaultStore(`whatsapp_verify_token_${waNodeId}`, verifyToken);
        }

        let config: Record<string, unknown> = {};
        if (existsSync(CONFIG_PATH)) {
          try {
            config = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8')) as Record<string, unknown>;
          } catch {
            config = {};
          }
        }
        const channels = (config['channels'] ?? {}) as Record<string, unknown>;
        const webhookPort = Number(credentials['webhookPort']) || 9090;
        channels['whatsapp'] = {
          enabled: true,
          phoneNumberId,
          webhookPort,
        };
        config['channels'] = channels;
        writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');

        restartDaemon();

        return {
          success: true,
          displayName: body.verified_name ?? body.display_phone_number ?? 'WhatsApp',
        };
      }

      if (platform === 'discord') {
        const token = String(credentials['token'] ?? '');
        if (!token) {
          return { success: false, error: 'Bot token required' };
        }

        const res = await fetch('https://discord.com/api/v10/users/@me', {
          headers: { Authorization: `Bot ${token}` },
          signal: AbortSignal.timeout(10_000),
        });
        const body = (await res.json()) as {
          id?: string;
          username?: string;
          discriminator?: string;
          avatar?: string;
          message?: string;
        };

        if (!res.ok || !body.id) {
          return { success: false, error: body.message ?? 'Invalid Discord bot token' };
        }

        let photoBase64: string | null = null;
        if (body.avatar) {
          try {
            const avatarUrl = `https://cdn.discordapp.com/avatars/${body.id}/${body.avatar}.png?size=128`;
            const imgRes = await fetch(avatarUrl, { signal: AbortSignal.timeout(10_000) });
            const imgBuf = Buffer.from(await imgRes.arrayBuffer());
            photoBase64 = `data:image/png;base64,${imgBuf.toString('base64')}`;
          } catch {
            // Avatar fetch is best-effort
          }
        }

        vaultStore('discord_bot_token', token);
        const discordNodeId = credentials['nodeId'] ? String(credentials['nodeId']) : null;
        if (discordNodeId) {
          vaultStore(`channel_token_${discordNodeId}`, token);
        }

        let config: Record<string, unknown> = {};
        if (existsSync(CONFIG_PATH)) {
          try {
            config = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8')) as Record<string, unknown>;
          } catch {
            config = {};
          }
        }
        const channels = (config['channels'] ?? {}) as Record<string, unknown>;
        channels['discord'] = {
          enabled: true,
          botUserId: body.id,
        };
        config['channels'] = channels;
        writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');

        restartDaemon();

        return {
          success: true,
          botUsername: body.username ?? 'Discord Bot',
          botId: body.id,
          photo: photoBase64,
        };
      }

      if (platform === 'email') {
        const imapHost = String(credentials['imapHost'] ?? '');
        const smtpHost = String(credentials['smtpHost'] ?? '');
        const username = String(credentials['username'] ?? '');
        const password = String(credentials['password'] ?? '');
        const imapPort = Number(credentials['imapPort']) || 993;
        const smtpPort = Number(credentials['smtpPort']) || 587;

        if (!imapHost || !username || !password) {
          return { success: false, error: 'IMAP host, username, and password required' };
        }

        vaultStore('email_password', password);
        const emailNodeId = credentials['nodeId'] ? String(credentials['nodeId']) : null;
        if (emailNodeId) {
          vaultStore(`channel_token_${emailNodeId}`, password);
        }

        let config: Record<string, unknown> = {};
        if (existsSync(CONFIG_PATH)) {
          try {
            config = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8')) as Record<string, unknown>;
          } catch {
            config = {};
          }
        }
        const channels = (config['channels'] ?? {}) as Record<string, unknown>;
        channels['email'] = {
          enabled: true,
          imapHost,
          imapPort,
          smtpHost: smtpHost || imapHost,
          smtpPort,
          username,
          tls: true,
        };
        config['channels'] = channels;
        writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');

        restartDaemon();

        return {
          success: true,
          displayName: username,
        };
      }

      if (platform === 'gmail') {
        return {
          success: false,
          error: 'Gmail OAuth coming soon. Use Email (IMAP) with a Google App Password instead.',
        };
      }

      return { success: false, error: `Unknown platform: ${platform}` };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Connection failed',
      };
    }
  },
);

ipcMain.handle('disconnect-channel', (_event, platform: string, nodeId: string) => {
  try {
    stopDaemon();

    // Remove per-node vault tokens
    const vaultFiles = [`channel_token_${nodeId}.enc`];
    if (platform === 'slack') {
      vaultFiles.push(`channel_signing_${nodeId}.enc`);
    }

    for (const file of vaultFiles) {
      const filePath = join(OPENWIND_HOME, 'vault', file);
      if (existsSync(filePath)) {
        const size = readFileSync(filePath).length;
        writeFileSync(filePath, randomBytes(size));
        require('fs').unlinkSync(filePath);
      }
    }

    // Remove per-node profile from bot-profiles.json
    const profileKey = nodeId;
    const profilePath = join(OPENWIND_HOME, 'bot-profiles.json');
    if (existsSync(profilePath)) {
      try {
        const profiles = JSON.parse(readFileSync(profilePath, 'utf-8')) as Record<string, unknown>;
        delete profiles[profileKey];
        writeFileSync(profilePath, JSON.stringify(profiles, null, 2), 'utf-8');
      } catch {
        // ignore parse errors
      }
    }

    // Update canvas node status to disconnected
    const canvasPath = join(OPENWIND_HOME, 'canvas.json');
    if (existsSync(canvasPath)) {
      try {
        const canvas = JSON.parse(readFileSync(canvasPath, 'utf-8')) as Record<string, unknown>;
        const nodes = (canvas['nodes'] ?? []) as Array<Record<string, unknown>>;
        const node = nodes.find((n) => n['id'] === nodeId);
        if (node) {
          node['status'] = 'setup';
          node['photo'] = null;
          node['label'] = platform.charAt(0).toUpperCase() + platform.slice(1);
          node['credentials'] = '';
          node['meta'] = {};
        }
        writeFileSync(canvasPath, JSON.stringify(canvas, null, 2), 'utf-8');
      } catch {
        // ignore canvas errors
      }
    }

    // Recalculate config from remaining profiles
    if (existsSync(CONFIG_PATH)) {
      const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8')) as Record<string, unknown>;
      const channels = (config['channels'] ?? {}) as Record<string, unknown>;

      if (platform === 'telegram') {
        // Check if other telegram bots remain
        let remainingProfiles: Record<string, unknown> = {};
        if (existsSync(profilePath)) {
          try {
            remainingProfiles = JSON.parse(readFileSync(profilePath, 'utf-8')) as Record<
              string,
              unknown
            >;
          } catch {
            remainingProfiles = {};
          }
        }
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
      writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
    }

    startDaemon();
    return { success: true };
  } catch {
    return { success: false };
  }
});

// ─── App Lifecycle ─────────────────────────────────────────────────────

app.whenReady().then(() => {
  registerBrainHandlers();
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
