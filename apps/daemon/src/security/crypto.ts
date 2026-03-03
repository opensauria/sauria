// Re-export from canonical @opensauria/vault package.
export {
  generateMasterKey,
  deriveWrappingKey,
  encryptData,
  decryptData,
  storeSecret,
  getSecret,
  deleteSecret,
} from '@opensauria/vault';
