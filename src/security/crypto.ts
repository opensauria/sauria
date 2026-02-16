import { createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes } from 'node:crypto';
import { chmod, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { paths } from '../config/paths.js';
import { safePath, safeReadFile, safeWriteFile } from './fs-sandbox.js';

const PBKDF2_ITERATIONS = 256_000;
const PBKDF2_DIGEST = 'sha512';
const KEY_LENGTH = 32;
const SALT_LENGTH = 32;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const ALGORITHM = 'aes-256-gcm';

export function generateMasterKey(): Buffer {
  return randomBytes(KEY_LENGTH);
}

export function deriveWrappingKey(password: string, salt: Buffer): Buffer {
  return pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LENGTH, PBKDF2_DIGEST);
}

export function encryptData(
  data: Buffer,
  key: Buffer,
): { iv: Buffer; authTag: Buffer; encrypted: Buffer } {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return { iv, authTag, encrypted };
}

export function decryptData(
  encrypted: Buffer,
  key: Buffer,
  iv: Buffer,
  authTag: Buffer,
): Buffer {
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

function secretFilePath(name: string): string {
  return join(paths.vault, `${name}.enc`);
}

export async function storeSecret(
  name: string,
  value: string,
  password: string,
): Promise<void> {
  const salt = randomBytes(SALT_LENGTH);
  const key = deriveWrappingKey(password, salt);
  const { iv, authTag, encrypted } = encryptData(Buffer.from(value, 'utf-8'), key);

  // File layout: salt (32) | iv (12) | authTag (16) | encrypted (rest)
  const fileData = Buffer.concat([salt, iv, authTag, encrypted]);
  const filePath = secretFilePath(name);

  await safeWriteFile(filePath, fileData);
  await chmod(filePath, 0o600);
}

export async function getSecret(
  name: string,
  password: string,
): Promise<string> {
  const filePath = secretFilePath(name);
  const fileData = await safeReadFile(filePath);

  const salt = fileData.subarray(0, SALT_LENGTH);
  const iv = fileData.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const authTag = fileData.subarray(
    SALT_LENGTH + IV_LENGTH,
    SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH,
  );
  const encrypted = fileData.subarray(SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);

  const key = deriveWrappingKey(password, salt);
  const decrypted = decryptData(encrypted, key, iv, authTag);

  return decrypted.toString('utf-8');
}

export async function deleteSecret(name: string): Promise<void> {
  const filePath = secretFilePath(name);
  const validPath = safePath(filePath);
  const fileData = await safeReadFile(filePath);

  // Overwrite with random bytes before deleting
  const overwrite = randomBytes(fileData.length);
  await safeWriteFile(filePath, overwrite);
  await unlink(validPath);
}
