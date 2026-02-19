// Re-export from canonical @openwind/vault package.
export {
  generateMasterKey,
  deriveWrappingKey,
  encryptData,
  decryptData,
  storeSecret,
  getSecret,
  deleteSecret,
} from '@openwind/vault';
