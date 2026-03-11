import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    pool: 'forks',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/__tests__/**',
        'src/**/types.ts',
        'src/**/index.ts',
        // Re-exports from @sauria/vault (tested in that package)
        'src/security/crypto.ts',
        'src/security/fs-sandbox.ts',
        'src/security/vault-key.ts',
        // Re-exports from @sauria/config (tested in that package)
        'src/config/defaults.ts',
        'src/config/paths.ts',
        'src/config/schema.ts',
        // Re-export barrel (individual modules tested directly)
        'src/db/brain-queries.ts',
        // Abstract interface (tested through concrete implementations)
        'src/channels/base.ts',
        // Entry points — integration-level, not unit-testable
        'src/cli.ts',
        'src/cli-commands.ts',
        'src/cli-actions.ts',
        'src/daemon.ts',
        'src/daemon-lifecycle.ts',
        'src/daemon-watchers.ts',
        'src/daemon-ipc.ts',
        'src/orchestrator-setup.ts',
        'src/graph-loader.ts',
        'src/graph-persistence.ts',
        'src/integration-ipc.ts',
        'src/channel-factory.ts',
        'src/pid-lock.ts',
      ],
      thresholds: {
        statements: 95,
        branches: 86,
        functions: 95,
        lines: 96,
      },
    },
  },
});
