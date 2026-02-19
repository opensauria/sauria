export { paths } from './paths.js';
export type { PathKey } from './paths.js';

export {
  OpenSauriaConfigSchema,
  ModelConfigSchema,
  AuthConfigSchema,
  McpServerConfigSchema,
  ChannelsConfigSchema,
} from './schema.js';

export type {
  OpenSauriaConfig,
  ModelConfig,
  AuthConfig,
  McpServerConfig,
  OwnerIdentityConfig,
  OrchestratorConfig,
} from './schema.js';

export { DEFAULT_CONFIG, CLOUD_PRESETS, createLocalPreset } from './defaults.js';
export type { ModelPreset, ModelPresetSet } from './defaults.js';
