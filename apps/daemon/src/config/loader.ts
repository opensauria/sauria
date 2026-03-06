import { chmod } from 'node:fs/promises';
import JSON5 from 'json5';
import { paths } from './paths.js';
import { SauriaConfigSchema } from './schema.js';
import type { SauriaConfig } from './schema.js';
import { DEFAULT_CONFIG } from './defaults.js';
import { safeMkdir, safeReadFile, safeWriteFile } from '../security/fs-sandbox.js';

export async function loadConfig(): Promise<SauriaConfig> {
  let raw: string;

  try {
    const buffer = await safeReadFile(paths.config);
    raw = buffer.toString('utf-8');
  } catch (error: unknown) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return DEFAULT_CONFIG;
    }
    throw error;
  }

  const parsed: unknown = JSON5.parse(raw);
  return SauriaConfigSchema.parse(parsed);
}

export async function saveConfig(config: SauriaConfig): Promise<void> {
  const validated = SauriaConfigSchema.parse(config);
  const serialized = JSON5.stringify(validated, { space: 2 });

  await safeWriteFile(paths.config, serialized);
  await chmod(paths.config, 0o600);
}

export async function ensureConfigDir(): Promise<void> {
  const dirs = [paths.home, paths.logs, paths.tmp, paths.exports, paths.vault];

  for (const dir of dirs) {
    await safeMkdir(dir);
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
