import { execFileSync } from 'node:child_process';
import { defineConfig } from 'tsdown';

const buildHash = (() => {
  try {
    return execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
})();

export default defineConfig({
  entry: ['src/index.ts'],
  format: 'esm',
  dts: true,
  define: {
    SAURIA_VERSION: JSON.stringify(process.env['npm_package_version'] ?? '0.0.0'),
    SAURIA_BUILD_HASH: JSON.stringify(buildHash),
  },
  deps: {
    alwaysBundle: [/.*/],
    neverBundle: ['better-sqlite3'],
    onlyAllowBundle: false,
  },
});
