import * as p from '@clack/prompts';
import { openDatabase, closeDatabase } from '../db/connection.js';
import { applySchema } from '../db/schema.js';
import { loadConfig, saveConfig, ensureConfigDir } from '../config/loader.js';
import { paths } from '@opensauria/config';
import { vaultStore } from '../security/vault-key.js';
import type { OpenSauriaConfig } from '../config/schema.js';
import { validateCredential } from './validate.js';
import {
  generateCodeVerifier,
  generateCodeChallenge,
  buildAuthorizationUrl,
  exchangeAuthorizationCode,
  storeOAuthTokens,
} from './oauth.js';
import { getModelPreset, formatPresetSummary } from './model-presets.js';
import { detectMcpClients } from '../setup/detect-clients.js';
import { registerMcpInAllClients } from '../setup/register-mcp.js';
import { generateDaemonService } from '../setup/daemon-service.js';
import { detectLocalProviders } from '../setup/detect-local-providers.js';

function handleCancel(): never {
  p.cancel('Setup cancelled.');
  process.exit(0);
}

// ─── Step 1: How do you want to connect? ────────────────────────────────

type ConnectionMode = 'claude_subscription' | 'api_key' | 'local';

async function chooseConnectionMode(): Promise<ConnectionMode> {
  const mode = await p.select({
    message: 'How do you want to connect your AI?',
    options: [
      {
        value: 'claude_subscription' as const,
        label: 'I have a Claude subscription',
        hint: 'Pro/Max — login with your account',
      },
      {
        value: 'api_key' as const,
        label: 'I have an API key',
        hint: 'Anthropic, OpenAI, Google, etc.',
      },
      {
        value: 'local' as const,
        label: 'I run models locally',
        hint: 'Ollama, LM Studio, Open WebUI',
      },
    ],
  });
  if (p.isCancel(mode)) handleCancel();
  return mode;
}

// ─── Path A: Claude subscription (OAuth) ────────────────────────────────

async function setupClaudeSubscription(): Promise<{
  provider: string;
  authMethod: 'oauth';
  credential: string;
}> {
  const verifier = generateCodeVerifier();
  const challenge = generateCodeChallenge(verifier);
  const state = crypto.randomUUID();
  const url = buildAuthorizationUrl(challenge, state);

  p.note(
    `Open this URL in your browser:\n\n${url}\n\n` +
      'Log in with your Claude account.\n' +
      'After authorizing, copy the code shown on screen.',
    'Login with Claude',
  );

  const code = await p.text({
    message: 'Paste the authorization code:',
    validate: (v) => (!v || v.length < 10 ? 'Code seems too short' : undefined),
  });
  if (p.isCancel(code)) handleCancel();

  const s = p.spinner();
  s.start('Logging in...');
  const tokens = await exchangeAuthorizationCode(code, verifier);
  await storeOAuthTokens('anthropic', tokens);
  s.stop('Logged in successfully.');

  return { provider: 'anthropic', authMethod: 'oauth', credential: tokens.access_token };
}

// ─── Path B: API key ────────────────────────────────────────────────────

async function setupApiKey(): Promise<{
  provider: string;
  authMethod: 'encrypted_file';
  credential: string;
}> {
  const provider = await p.select({
    message: 'Which provider?',
    options: [
      { value: 'anthropic', label: 'Anthropic', hint: 'Claude' },
      { value: 'openai', label: 'OpenAI', hint: 'GPT-4o' },
      { value: 'google', label: 'Google', hint: 'Gemini' },
    ],
  });
  if (p.isCancel(provider)) handleCancel();

  const key = await p.password({
    message: `Enter your ${provider} API key:`,
    validate: (v) => (!v || v.length < 8 ? 'API key seems too short' : undefined),
  });
  if (p.isCancel(key)) handleCancel();

  const s = p.spinner();
  s.start('Validating...');
  const result = await validateCredential(provider, key);
  if (result.isValid) {
    s.stop(`Valid: ${result.accountInfo ?? 'OK'}`);
  } else {
    s.stop(`Warning: ${result.error ?? 'Could not validate'}`);
    const proceed = await p.confirm({ message: 'Continue anyway?', initialValue: false });
    if (p.isCancel(proceed) || !proceed) handleCancel();
  }

  const vs = p.spinner();
  vs.start('Encrypting credentials...');
  await vaultStore(`${provider}-api-key`, key);
  vs.stop('Credentials stored in encrypted vault.');

  return { provider, authMethod: 'encrypted_file', credential: key };
}

// ─── Path C: Local models ───────────────────────────────────────────────

async function setupLocal(): Promise<{
  provider: string;
  authMethod: 'none';
  credential: string;
}> {
  const s = p.spinner();
  s.start('Scanning for local AI providers...');
  const locals = await detectLocalProviders();
  const running = locals.filter((l) => l.running);
  s.stop(
    running.length > 0
      ? `Found: ${running.map((l) => l.name).join(', ')}`
      : 'No local provider detected.',
  );

  let provider: string;
  let baseUrl: string;

  if (running.length === 1) {
    provider = running[0]!.name.toLowerCase().replace(/\s+/g, '-');
    baseUrl = running[0]!.baseUrl;
    p.log.info(`Using ${running[0]!.name} at ${baseUrl}`);
  } else if (running.length > 1) {
    const choice = await p.select({
      message: 'Multiple providers detected. Which one?',
      options: running.map((l) => ({
        value: l.baseUrl,
        label: l.name,
        hint: l.baseUrl,
      })),
    });
    if (p.isCancel(choice)) handleCancel();
    baseUrl = choice;
    const match = running.find((l) => l.baseUrl === choice);
    provider = match ? match.name.toLowerCase().replace(/\s+/g, '-') : 'ollama';
  } else {
    p.log.warn('No local provider is running.');
    const choice = await p.select({
      message: 'Which provider will you use?',
      options: [
        { value: 'ollama', label: 'Ollama', hint: 'localhost:11434' },
        { value: 'lm-studio', label: 'LM Studio', hint: 'localhost:1234' },
        { value: 'open-webui', label: 'Open WebUI', hint: 'localhost:3000' },
      ],
    });
    if (p.isCancel(choice)) handleCancel();
    provider = choice;
    const urls: Record<string, string> = {
      ollama: 'http://localhost:11434',
      'lm-studio': 'http://localhost:1234',
      'open-webui': 'http://localhost:3000',
    };
    baseUrl = urls[provider] ?? 'http://localhost:11434';
    p.log.info(`Start ${provider} before running OpenSauria.`);
  }

  // Store the base URL so the router knows where to connect
  await vaultStore('local-base-url', baseUrl);

  return { provider, authMethod: 'none', credential: '' };
}

// ─── Post-setup automation ──────────────────────────────────────────────

async function runPostSetup(
  provider: string,
  authMethod: string,
  preset: ReturnType<typeof getModelPreset>,
): Promise<void> {
  // MCP client registration
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

  // Daemon service
  const daemonSpin = p.spinner();
  daemonSpin.start('Setting up background service...');
  const daemon = generateDaemonService();
  if (daemon) {
    daemonSpin.stop(`Daemon ready (${daemon.platform}).`);
  } else {
    daemonSpin.stop('Daemon: run `opensauria daemon` manually.');
  }

  // Summary
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
    p.outro('Restart your AI client and OpenSauria is ready.');
  } else {
    p.outro('Run `opensauria daemon` to start.');
  }
}

// ─── Main ───────────────────────────────────────────────────────────────

export async function runOnboarding(): Promise<void> {
  p.intro('Welcome to OpenSauria');

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

  // Init
  const initSpin = p.spinner();
  initSpin.start('Initializing...');
  await ensureConfigDir();
  const db = openDatabase();
  applySchema(db);
  closeDatabase(db);
  initSpin.stop('Ready.');

  // Config
  const preset = getModelPreset(provider);
  const config = await loadConfig();
  const updatedConfig: OpenSauriaConfig = {
    ...config,
    models: { ...preset },
    auth: { ...config.auth, [provider]: { method: authMethod } },
  };
  await saveConfig(updatedConfig);

  await runPostSetup(provider, authMethod, preset);
}
