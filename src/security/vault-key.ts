import { createHash } from 'node:crypto';
import { hostname, userInfo } from 'node:os';
import { storeSecret, getSecret, deleteSecret } from './crypto.js';

/**
 * Derives a deterministic vault password from machine identity.
 * Purpose: prevent plaintext leakage in logs/clipboard/config.
 * NOT meant to resist the local user account.
 */
function deriveVaultPassword(): string {
  return createHash('sha256')
    .update(`${hostname()}:${userInfo().username}:openwind-vault`)
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
