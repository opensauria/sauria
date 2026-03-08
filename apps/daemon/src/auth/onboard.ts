import * as p from '@clack/prompts';
import { openDatabase, closeDatabase } from '../db/connection.js';
import { applySchema } from '../db/schema.js';
import { loadConfig, saveConfig, ensureConfigDir } from '../config/loader.js';
import { paths } from '@sauria/config';
import type { SauriaConfig } from '../config/schema.js';
import { getModelPreset, formatPresetSummary } from './model-presets.js';
import { detectMcpClients } from '../setup/detect-clients.js';
import { registerMcpInAllClients } from '../setup/register-mcp.js';
import { generateDaemonService } from '../setup/daemon-service.js';
import {
  chooseConnectionMode,
  setupClaudeSubscription,
  setupApiKey,
  setupLocal,
} from './onboard-providers.js';

// ─── Post-setup automation ──────────────────────────────────────────────

async function runPostSetup(
  provider: string,
  authMethod: string,
  preset: ReturnType<typeof getModelPreset>,
): Promise<void> {
  const mcpSpin = p.spinner();
  mcpSpin.start('Connecting to your AI clients...');
  const clients = detectMcpClients();
  const detected = clients.filter((c) => c.detected);

  if (detected.length > 0) {
    const results = registerMcpInAllClients(clients);
    const registered = results.filter((r) => r.status === 'registered');
    const already = results.filter((r) => r.status === 'already_registered');
    const parts: string[] = [];
    if (registered.length > 0) {
      parts.push(registered.map((r) => r.client).join(', '));
    }
    if (already.length > 0) {
      parts.push(`already: ${already.map((r) => r.client).join(', ')}`);
    }
    mcpSpin.stop(`Connected: ${parts.join(' | ')}`);
  } else {
    mcpSpin.stop('No AI clients detected.');
  }

  const daemonSpin = p.spinner();
  daemonSpin.start('Setting up background service...');
  const daemon = generateDaemonService();
  if (daemon) {
    daemonSpin.stop(`Daemon ready (${daemon.platform}).`);
  } else {
    daemonSpin.stop('Daemon: run `sauria daemon` manually.');
  }

  const lines = [
    `Provider:    ${provider} (${authMethod})`,
    formatPresetSummary(preset),
    `Database:    ${paths.db}`,
  ];

  if (detected.length > 0) {
    lines.push(`AI clients:  ${detected.map((c) => c.name).join(', ')}`);
  }

  p.note(lines.join('\n'), 'Setup Complete');

  if (detected.length > 0) {
    p.outro('Restart your AI client and Sauria is ready.');
  } else {
    p.outro('Run `sauria daemon` to start.');
  }
}

// ─── Main ───────────────────────────────────────────────────────────────

export async function runOnboarding(): Promise<void> {
  p.intro('Welcome to Sauria');

  const mode = await chooseConnectionMode();

  let provider: string;
  let authMethod: 'encrypted_file' | 'env' | 'oauth' | 'none';

  if (mode === 'claude_subscription') {
    const result = await setupClaudeSubscription();
    provider = result.provider;
    authMethod = result.authMethod;
  } else if (mode === 'api_key') {
    const result = await setupApiKey();
    provider = result.provider;
    authMethod = result.authMethod;
  } else {
    const result = await setupLocal();
    provider = result.provider;
    authMethod = result.authMethod;
  }

  const initSpin = p.spinner();
  initSpin.start('Initializing...');
  await ensureConfigDir();
  const db = openDatabase();
  applySchema(db);
  closeDatabase(db);
  initSpin.stop('Ready.');

  const preset = getModelPreset(provider);
  const config = await loadConfig();
  const updatedConfig: SauriaConfig = {
    ...config,
    models: { ...preset },
    auth: { ...config.auth, [provider]: { method: authMethod } },
  };
  await saveConfig(updatedConfig);

  await runPostSetup(provider, authMethod, preset);
}
