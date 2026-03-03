/**
 * Derives a deterministic vault password from machine identity.
 * Uses hardware UUID (macOS) or machine-id (Linux) — never hostname.
 */

import { createHash } from 'node:crypto';
import { userInfo } from 'node:os';
import { machineId } from './machine-id.js';

export function deriveVaultPassword(): string {
  return createHash('sha256')
    .update(`${machineId()}:${userInfo().username}:opensauria-vault`)
    .digest('hex');
}
