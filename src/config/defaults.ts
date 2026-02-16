import { OpenWindConfigSchema } from './schema.js';
import type { OpenWindConfig } from './schema.js';

export const DEFAULT_CONFIG: OpenWindConfig = OpenWindConfigSchema.parse({});
