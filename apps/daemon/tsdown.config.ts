import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  format: 'esm',
  dts: true,
  define: {
    SAURIA_VERSION: JSON.stringify(process.env['npm_package_version'] ?? '0.0.0'),
  },
  noExternal: [/.*/],
  external: ['better-sqlite3'],
});
