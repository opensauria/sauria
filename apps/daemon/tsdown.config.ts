import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  format: 'esm',
  dts: true,
  define: {
    SAURIA_VERSION: JSON.stringify(process.env['npm_package_version'] ?? '0.0.0'),
  },
  deps: {
    alwaysBundle: [/.*/],
    neverBundle: ['better-sqlite3'],
    onlyAllowBundle: false,
  },
});
