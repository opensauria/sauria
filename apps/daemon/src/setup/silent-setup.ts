import { openDatabase, closeDatabase } from '../db/connection.js';
import { applySchema } from '../db/schema.js';
import { loadConfig, saveConfig, ensureConfigDir } from '../config/loader.js';
import { vaultStore } from '../security/vault-key.js';
import { validateCredential } from '../auth/validate.js';
import { getModelPreset } from '../auth/model-presets.js';
import { detectMcpClients } from './detect-clients.js';
import { registerMcpInAllClients } from './register-mcp.js';
import { generateDaemonService } from './daemon-service.js';
import type { SauriaConfig } from '../config/schema.js';

export interface SetupOptions {
  readonly provider: string;
  readonly apiKey: string;
  readonly validate: boolean;
}

export interface SetupResult {
  readonly success: boolean;
  readonly error?: string;
  readonly mcpClients: string[];
  readonly daemonCommand?: string;
}

function log(message: string): void {
  process.stdout.write(`${message}\n`);
}

export async function runSilentSetup(options: SetupOptions): Promise<SetupResult> {
  const { provider, apiKey, validate } = options;

  // Validate credentials
  if (validate && provider !== 'ollama') {
    log('Validating credentials...');
    const result = await validateCredential(provider, apiKey);
    if (!result.isValid) {
      return { success: false, error: result.error ?? 'Invalid credentials', mcpClients: [] };
    }
    log(`Credentials valid: ${result.accountInfo ?? 'OK'}`);
  }

  // Create directories
  log('Initializing...');
  await ensureConfigDir();

  // Store credentials in vault
  if (provider !== 'ollama' && apiKey) {
    await vaultStore(`${provider}-api-key`, apiKey);
  }

  // Initialize database
  const db = openDatabase();
  applySchema(db);
  closeDatabase(db);

  // Write configuration
  const preset = getModelPreset(provider);
  const config = await loadConfig();
  const updatedConfig: SauriaConfig = {
    ...config,
    models: { ...preset },
    auth: {
      ...config.auth,
      [provider]: { method: provider === 'ollama' ? 'none' : 'encrypted_file' },
    },
  };
  await saveConfig(updatedConfig);

  // Register MCP in detected clients
  const clients = detectMcpClients();
  const results = registerMcpInAllClients(clients);
  const registered = results
    .filter((r) => r.status === 'registered' || r.status === 'already_registered')
    .map((r) => r.client);

  // Generate daemon service
  const daemon = generateDaemonService();

  log('Setup complete.');

  return {
    success: true,
    mcpClients: registered,
    daemonCommand: daemon?.activationCommand,
  };
}
