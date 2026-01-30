import { defineConfig } from 'vitest/config';

// Check if running E2E tests (from environment or command)
const isE2E = process.env.RUN_E2E === 'true' || process.argv.includes('tests/e2e');

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.spec.ts', 'tests/**/*.e2e.ts'],
    globals: false,
    passWithNoTests: true,
    env: {
      RUN_E2E: isE2E ? 'true' : ''
    }
  },
  resolve: {
    alias: {
      'obsidian': './node_modules/obsidian'
    }
  },
  esbuild: {
    target: 'node18'
  }
});
