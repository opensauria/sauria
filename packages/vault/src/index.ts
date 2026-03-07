export { machineId } from './machine-id.js';
export { deriveVaultPassword } from './derive-password.js';

export {
  generateMasterKey,
  deriveWrappingKey,
  encryptData,
  decryptData,
  storeSecret,
  getSecret,
  deleteSecret,
  vaultStore,
  vaultGet,
  vaultDelete,
} from './crypto.js';

export {
  PathTraversalError,
  safePath,
  safeReadFile,
  safeWriteFile,
  safeMkdir,
} from './fs-sandbox.js';

export { vaultExport, vaultImport } from './backup.js';
