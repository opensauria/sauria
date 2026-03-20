/**
 * Generates model-presets.json from MODEL_IDS — the single source of truth.
 * Rust code uses `include_str!` to embed this at compile time.
 * Run: npx tsx scripts/generate-presets.ts
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODEL_IDS } from '../src/model-ids.js';
import { CLOUD_PRESETS, createLocalPreset } from '../src/defaults.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'generated');

mkdirSync(outDir, { recursive: true });

const presets = {
  cloud: CLOUD_PRESETS,
  local: {
    ollama: createLocalPreset('ollama', 'http://localhost:11434'),
    'lm-studio': createLocalPreset('lm-studio', 'http://localhost:1234'),
    'open-webui': createLocalPreset('open-webui', 'http://localhost:3000'),
  },
  ids: MODEL_IDS,
};

const json = JSON.stringify(presets, null, 2);
writeFileSync(join(outDir, 'model-presets.json'), json, 'utf-8');

console.log(`Generated model-presets.json (${json.length} bytes)`);
