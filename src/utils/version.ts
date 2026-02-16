import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

interface PackageJson {
  readonly version: string;
}

function isPackageJson(value: unknown): value is PackageJson {
  if (value === null || typeof value !== 'object') return false;
  return typeof (value as Record<string, unknown>)['version'] === 'string';
}

let cachedVersion: string | undefined;

export function getVersion(): string {
  if (cachedVersion !== undefined) return cachedVersion;

  try {
    const currentDir = dirname(fileURLToPath(import.meta.url));
    const packagePath = join(currentDir, '..', '..', 'package.json');
    const raw = readFileSync(packagePath, 'utf-8');
    const parsed: unknown = JSON.parse(raw);
    if (isPackageJson(parsed)) {
      cachedVersion = parsed.version;
      return cachedVersion;
    }
  } catch {
    // Fallback if file read fails
  }

  cachedVersion = '0.1.0';
  return cachedVersion;
}
