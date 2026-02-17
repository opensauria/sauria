import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { platform, userInfo } from 'node:os';
import { join } from 'node:path';
import { storeSecret, getSecret, deleteSecret } from './crypto.js';
import { paths } from '../config/paths.js';

/**
 * Returns a stable, immutable machine identifier.
 *
 * macOS `os.hostname()` changes with network state (`Foo`, `Foo.local`,
 * `mac.home`, etc.) which silently breaks vault decryption. Instead we
 * use the hardware UUID on macOS and a cached random ID elsewhere.
 *
 * The ID is cached to `~/.openwind/vault/.machine-id` so it survives
 * across processes and is only computed once.
 */
function machineId(): string {
  const cacheDir = paths.vault;
  const cachePath = join(cacheDir, '.machine-id');

  if (existsSync(cachePath)) {
    const cached = readFileSync(cachePath, 'utf-8').trim();
    if (cached.length > 0) return cached;
  }

  let id: string;
  if (platform() === 'darwin') {
    try {
      const raw = execSync(
        'ioreg -rd1 -c IOPlatformExpertDevice | grep IOPlatformUUID',
        { encoding: 'utf-8', timeout: 3000 },
      );
      const match = raw.match(/"([A-F0-9-]{36})"/);
      id = match?.[1] ?? userInfo().username;
    } catch {
      id = userInfo().username;
    }
  } else if (platform() === 'linux') {
    try {
      id = readFileSync('/etc/machine-id', 'utf-8').trim();
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

/**
 * Derives a deterministic vault password from machine identity.
 * Uses hardware UUID (macOS) or machine-id (Linux) — never hostname.
 */
function deriveVaultPassword(): string {
  return createHash('sha256')
    .update(`${machineId()}:${userInfo().username}:openwind-vault`)
    .digest('hex');
}

export async function vaultStore(name: string, value: string): Promise<void> {
  const password = deriveVaultPassword();
  await storeSecret(name, value, password);
}

export async function vaultGet(name: string): Promise<string | null> {
  const password = deriveVaultPassword();
  try {
    return await getSecret(name, password);
  } catch {
    return null;
  }
}

export async function vaultDelete(name: string): Promise<void> {
  try {
    await deleteSecret(name);
  } catch {
    // Secret may not exist, ignore
  }
}
