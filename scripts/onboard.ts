import { createInterface } from 'node:readline';
import { mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const OPENWIND_HOME = process.env['OPENWIND_HOME'] ?? join(homedir(), '.openwind');

const PROVIDERS = ['anthropic', 'openai', 'google', 'ollama'] as const;

const ENV_VAR_MAP: Readonly<Record<string, string>> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  google: 'GOOGLE_API_KEY',
};

interface OnboardState {
  provider: string;
  envVar: string;
  dataSources: string[];
}

function w(text: string): void {
  process.stdout.write(`${text}\n`);
}

function prompt(rl: ReturnType<typeof createInterface>, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

function ensureDirectoryStructure(): void {
  const dirs = [
    OPENWIND_HOME,
    join(OPENWIND_HOME, 'logs'),
    join(OPENWIND_HOME, 'tmp'),
    join(OPENWIND_HOME, 'exports'),
    join(OPENWIND_HOME, 'vault'),
  ];

  for (const dir of dirs) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
}

async function chooseProvider(rl: ReturnType<typeof createInterface>): Promise<string> {
  w('\n--- Step 1: Choose AI Provider ---');
  w('Available providers:');
  for (let i = 0; i < PROVIDERS.length; i++) {
    const provider = PROVIDERS[i];
    if (!provider) continue;
    w(`  ${String(i + 1)}. ${provider}`);
  }

  const choice = await prompt(rl, '\nSelect provider (1-4) [1]: ');
  const index = (parseInt(choice, 10) || 1) - 1;
  const selected = PROVIDERS[index] ?? PROVIDERS[0];
  if (!selected) return 'anthropic';
  w(`Selected: ${selected}`);
  return selected;
}

async function configureApiKey(
  rl: ReturnType<typeof createInterface>,
  provider: string,
): Promise<string> {
  w('\n--- Step 2: Configure API Key ---');
  const envVar = ENV_VAR_MAP[provider] ?? `${provider.toUpperCase()}_API_KEY`;

  if (provider === 'ollama') {
    w('Ollama runs locally, no API key needed.');
    return '';
  }

  w(`Set the ${envVar} environment variable in your shell profile.`);
  w('Example:');
  w(`  export ${envVar}="your-key-here"`);
  w('');

  const current = process.env[envVar];
  if (current) {
    w(`${envVar} is already set.`);
  } else {
    w(`${envVar} is NOT set. Please set it before running the daemon.`);
  }

  await prompt(rl, 'Press Enter to continue...');
  return envVar;
}

async function configureDataSources(
  rl: ReturnType<typeof createInterface>,
): Promise<string[]> {
  w('\n--- Step 3: Configure Data Sources ---');
  w('You can add MCP data sources later in ~/.openwind/config.json5');
  w('Common sources: email, calendar, notes, files');
  w('');

  const answer = await prompt(
    rl,
    'Enter comma-separated sources to configure later (or press Enter to skip): ',
  );

  if (!answer) return [];
  return answer.split(',').map((s) => s.trim()).filter(Boolean);
}

function printSummary(state: OnboardState): void {
  w('\n--- Setup Summary ---');
  w(`Home directory: ${OPENWIND_HOME}`);
  w(`AI provider:   ${state.provider}`);
  if (state.envVar) {
    w(`API key env:   ${state.envVar}`);
  }
  if (state.dataSources.length > 0) {
    w(`Data sources:  ${state.dataSources.join(', ')}`);
  }
  w('');
  w('Directory structure created:');
  w(`  ${OPENWIND_HOME}/`);
  w('  +-- logs/');
  w('  +-- tmp/');
  w('  +-- exports/');
  w('  +-- vault/');
  w('');
  w(`Database: ${join(OPENWIND_HOME, 'world.db')}`);

  const dbExists = existsSync(join(OPENWIND_HOME, 'world.db'));
  if (dbExists) {
    w('  (database already exists)');
  } else {
    w('  (will be created on first run)');
  }

  w('');
  w('Next steps:');
  w('  1. Set your API key environment variable');
  w('  2. Edit ~/.openwind/config.json5 to customize settings');
  w('  3. Run: openwind daemon');
  w('');
  w('Setup complete.');
}

async function main(): Promise<void> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  w('Welcome to OpenWind Setup');
  w('=========================');
  w('This wizard will configure your personal cognitive kernel.');

  try {
    ensureDirectoryStructure();

    const provider = await chooseProvider(rl);
    const envVar = await configureApiKey(rl, provider);
    const dataSources = await configureDataSources(rl);

    printSummary({ provider, envVar, dataSources });
  } finally {
    rl.close();
  }
}

void main();
