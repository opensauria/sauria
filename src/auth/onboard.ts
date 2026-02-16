import * as p from '@clack/prompts';
import { openDatabase, closeDatabase } from '../db/connection.js';
import { applySchema } from '../db/schema.js';
import { loadConfig, saveConfig, ensureConfigDir } from '../config/loader.js';
import { vaultStore } from '../security/vault-key.js';
import type { OpenWindConfig } from '../config/schema.js';
import { validateCredential } from './validate.js';
import {
  generateCodeVerifier,
  generateCodeChallenge,
  buildAuthorizationUrl,
  exchangeAuthorizationCode,
  storeOAuthTokens,
} from './oauth.js';
import { getModelPreset, formatPresetSummary } from './model-presets.js';

const PROVIDERS = [
  { value: 'anthropic', label: 'Anthropic', hint: 'Claude — recommended' },
  { value: 'openai', label: 'OpenAI', hint: 'GPT-4o' },
  { value: 'google', label: 'Google', hint: 'Gemini' },
  { value: 'ollama', label: 'Ollama', hint: 'Local, no API key' },
] as const;

function handleCancel(): never {
  p.cancel('Setup cancelled.');
  process.exit(0);
}

async function authenticateWithOAuth(): Promise<string> {
  const verifier = generateCodeVerifier();
  const challenge = generateCodeChallenge(verifier);
  const state = crypto.randomUUID();
  const url = buildAuthorizationUrl(challenge, state);

  p.note(
    `Open this URL in your browser:\n\n${url}\n\n` +
      'After authorizing, you will see an authorization code.\n' +
      'Copy and paste it below.',
    'OAuth Login',
  );

  const code = await p.text({
    message: 'Paste the authorization code:',
    validate: (v) => (v.length < 10 ? 'Code seems too short' : undefined),
  });
  if (p.isCancel(code)) handleCancel();

  const s = p.spinner();
  s.start('Exchanging authorization code...');
  const tokens = await exchangeAuthorizationCode(code, verifier);
  await storeOAuthTokens('anthropic', tokens);
  s.stop('OAuth tokens stored in vault.');

  return tokens.access_token;
}

async function authenticateWithApiKey(provider: string): Promise<string> {
  const key = await p.password({
    message: `Enter your ${provider} API key:`,
    validate: (v) => (v.length < 8 ? 'API key seems too short' : undefined),
  });
  if (p.isCancel(key)) handleCancel();
  return key;
}

async function chooseAnthropicAuth(): Promise<{
  method: 'oauth' | 'encrypted_file';
  credential: string;
}> {
  const authMethod = await p.select({
    message: 'How would you like to authenticate?',
    options: [
      { value: 'oauth', label: 'Login with Claude account', hint: 'Pro/Max subscription' },
      { value: 'api_key', label: 'Enter API key manually', hint: 'console.anthropic.com' },
    ],
  });
  if (p.isCancel(authMethod)) handleCancel();

  if (authMethod === 'oauth') {
    const token = await authenticateWithOAuth();
    return { method: 'oauth', credential: token };
  }

  const key = await authenticateWithApiKey('Anthropic');
  return { method: 'encrypted_file', credential: key };
}

async function storeApiKeyInVault(provider: string, apiKey: string): Promise<void> {
  await vaultStore(`${provider}-api-key`, apiKey);
}

export async function runOnboarding(): Promise<void> {
  p.intro('Welcome to OpenWind');

  const provider = await p.select({
    message: 'Choose your primary AI provider:',
    options: [...PROVIDERS],
  });
  if (p.isCancel(provider)) handleCancel();

  let authMethod: 'oauth' | 'encrypted_file' | 'env' | 'none' = 'none';
  let credential = '';

  if (provider === 'anthropic') {
    const result = await chooseAnthropicAuth();
    authMethod = result.method;
    credential = result.credential;
  } else if (provider !== 'ollama') {
    credential = await authenticateWithApiKey(provider);
    authMethod = 'encrypted_file';
  }

  if (credential && provider !== 'ollama') {
    const s = p.spinner();
    s.start('Validating credentials...');
    const result = await validateCredential(provider, credential);
    if (result.isValid) {
      s.stop(`Validated: ${result.accountInfo ?? 'OK'}`);
    } else {
      s.stop(`Warning: ${result.error ?? 'Validation failed'}`);
      const shouldContinue = await p.confirm({
        message: 'Continue anyway?',
        initialValue: false,
      });
      if (p.isCancel(shouldContinue) || !shouldContinue) handleCancel();
    }

    if (authMethod === 'encrypted_file') {
      const vs = p.spinner();
      vs.start('Storing credentials in vault...');
      await storeApiKeyInVault(provider, credential);
      vs.stop('Credentials stored in encrypted vault.');
    }
  }

  const ds = p.spinner();
  ds.start('Initializing directory structure...');
  await ensureConfigDir();
  ds.stop('Directory structure ready.');

  const dbs = p.spinner();
  dbs.start('Initializing database...');
  const db = openDatabase();
  applySchema(db);
  closeDatabase(db);
  dbs.stop('Database initialized.');

  const preset = getModelPreset(provider);

  const useDefaults = await p.confirm({
    message: 'Use recommended model assignments?',
    initialValue: true,
  });
  if (p.isCancel(useDefaults)) handleCancel();

  const config = await loadConfig();
  const updatedConfig: OpenWindConfig = {
    ...config,
    models: useDefaults ? { ...preset } : config.models,
    auth: {
      ...config.auth,
      [provider]: { method: authMethod },
    },
  };

  const cs = p.spinner();
  cs.start('Writing configuration...');
  await saveConfig(updatedConfig);
  cs.stop('Configuration saved.');

  p.note(
    [
      `Provider:   ${provider} (${authMethod})`,
      formatPresetSummary(preset),
      `Database:   ~/.openwind/world.db`,
      `Vault:      ~/.openwind/vault/`,
      `Config:     ~/.openwind/config.json5`,
    ].join('\n'),
    'Setup Summary',
  );

  p.outro('Setup complete! Run `openwind daemon` to start.');
}
