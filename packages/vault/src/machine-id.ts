/**
 * Stable, immutable machine identifier.
 *
 * macOS `os.hostname()` changes with network state (`Foo`, `Foo.local`,
 * `mac.home`, etc.) which silently breaks vault decryption. Instead we
 * use the hardware UUID on macOS and a cached random ID elsewhere.
 *
 * The ID is cached to `~/.sauria/vault/.machine-id` so it survives
 * across processes and is only computed once.
 *
 * Windows: uses PowerShell WMI query (Win32_ComputerSystemProduct.UUID).
 * This is the unified implementation — the desktop previously used `reg query`
 * which returns a different value (MachineGuid vs hardware UUID).
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { userInfo } from 'node:os';
import { join } from 'node:path';
import { paths } from '@sauria/config';

export function machineId(): string {
  const cacheDir = paths.vault;
  const cachePath = join(cacheDir, '.machine-id');

  if (existsSync(cachePath)) {
    const cached = readFileSync(cachePath, 'utf-8').trim();
    if (cached.length > 0) return cached;
  }

  let id: string;
  const os = process.platform;

  if (os === 'darwin') {
    try {
      const raw = execSync('ioreg -rd1 -c IOPlatformExpertDevice | grep IOPlatformUUID', {
        encoding: 'utf-8',
        timeout: 3000,
      });
      const match = raw.match(/"([A-F0-9-]{36})"/);
      id = match?.[1] ?? userInfo().username;
    } catch {
      id = userInfo().username;
    }
  } else if (os === 'linux') {
    try {
      id = readFileSync('/etc/machine-id', 'utf-8').trim();
    } catch {
      id = userInfo().username;
    }
  } else if (os === 'win32') {
    try {
      const raw = execSync(
        'powershell -NoProfile -Command "(Get-CimInstance Win32_ComputerSystemProduct).UUID"',
        { encoding: 'utf-8', timeout: 5000 },
      );
      const uuid = raw.trim();
      id = uuid.length > 0 ? uuid : userInfo().username;
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
