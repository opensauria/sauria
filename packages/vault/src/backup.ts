/**
 * Vault export/import — portable encrypted backup for key recovery.
 *
 * Archive format: salt (32) | iv (12) | authTag (16) | encrypted JSON (rest)
 * Uses a user-provided passphrase (not machine-derived) so the archive
 * is portable across machines.
 */

import { randomBytes } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { paths } from '@sauria/config';
import { deriveWrappingKey, encryptData, decryptData } from './crypto.js';
import { deriveVaultPassword } from './derive-password.js';
import { safeReadFile } from './fs-sandbox.js';
import { vaultStore } from './crypto.js';

const SALT_LENGTH = 32;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const HEADER_LENGTH = SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH;

const SKIP_FILES = new Set(['.machine-id']);

interface VaultArchive {
  readonly version: 1;
  readonly secrets: Record<string, string>;
  readonly exportedAt: string;
}

function stripEncExtension(filename: string): string {
  return filename.endsWith('.enc') ? filename.slice(0, -4) : filename;
}

/**
 * Export all vault secrets to a single encrypted archive.
 * Uses a user-provided passphrase (NOT the machine-derived password)
 * so the archive is portable across machines.
 */
export async function vaultExport(passphrase: string): Promise<Buffer> {
  if (!passphrase || passphrase.length === 0) {
    throw new Error('Passphrase must not be empty');
  }

  const vaultDir = paths.vault;
  const entries = await readdir(vaultDir);
  const encFiles = entries.filter((f) => f.endsWith('.enc') && !SKIP_FILES.has(f));

  if (encFiles.length === 0) {
    throw new Error('No secrets found in vault to export');
  }

  const password = deriveVaultPassword();
  const secrets: Record<string, string> = {};

  for (const file of encFiles) {
    const name = stripEncExtension(file);
    const filePath = join(vaultDir, file);
    const fileData = await safeReadFile(filePath);

    const salt = fileData.subarray(0, SALT_LENGTH);
    const iv = fileData.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const authTag = fileData.subarray(
      SALT_LENGTH + IV_LENGTH,
      SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH,
    );
    const encrypted = fileData.subarray(HEADER_LENGTH);

    const key = deriveWrappingKey(password, salt);
    const decrypted = decryptData(encrypted, key, iv, authTag);
    secrets[name] = decrypted.toString('utf-8');
  }

  const archive: VaultArchive = {
    version: 1,
    secrets,
    exportedAt: new Date().toISOString(),
  };

  const plaintext = Buffer.from(JSON.stringify(archive), 'utf-8');
  const salt = randomBytes(SALT_LENGTH);
  const wrappingKey = deriveWrappingKey(passphrase, salt);
  const { iv, authTag, encrypted } = encryptData(plaintext, wrappingKey);

  return Buffer.concat([salt, iv, authTag, encrypted]);
}

/**
 * Import vault secrets from an encrypted archive.
 * Decrypts with the user passphrase, re-encrypts each secret
 * with the current machine's vault password.
 */
export async function vaultImport(archive: Buffer, passphrase: string): Promise<number> {
  if (!passphrase || passphrase.length === 0) {
    throw new Error('Passphrase must not be empty');
  }

  if (archive.length < HEADER_LENGTH + 1) {
    throw new Error('Invalid archive: too short');
  }

  const salt = archive.subarray(0, SALT_LENGTH);
  const iv = archive.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const authTag = archive.subarray(
    SALT_LENGTH + IV_LENGTH,
    SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH,
  );
  const encrypted = archive.subarray(HEADER_LENGTH);

  const wrappingKey = deriveWrappingKey(passphrase, salt);

  let plaintext: Buffer;
  try {
    plaintext = decryptData(encrypted, wrappingKey, iv, authTag);
  } catch {
    throw new Error('Decryption failed: invalid passphrase or corrupted archive');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(plaintext.toString('utf-8')) as unknown;
  } catch {
    throw new Error('Invalid archive: malformed JSON payload');
  }

  const data = parsed as VaultArchive;
  if (data.version !== 1) {
    throw new Error(`Unsupported archive version: ${String(data.version)}`);
  }

  if (!data.secrets || typeof data.secrets !== 'object') {
    throw new Error('Invalid archive: missing secrets');
  }

  const secretEntries = Object.entries(data.secrets).filter(
    ([name]) => !SKIP_FILES.has(name) && !SKIP_FILES.has(`${name}.enc`),
  );

  let count = 0;
  for (const [name, value] of secretEntries) {
    if (typeof value !== 'string') {
      continue;
    }
    await vaultStore(name, value);
    count++;
  }

  return count;
}
