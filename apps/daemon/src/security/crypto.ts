// Re-export from canonical @sauria/vault package.
export {
  generateMasterKey,
  deriveWrappingKey,
  encryptData,
  decryptData,
  storeSecret,
  getSecret,
  deleteSecret,
} from '@sauria/vault';
