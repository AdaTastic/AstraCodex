import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/e2e/**/*.e2e.ts'],
    globals: true,
    passWithNoTests: true,
    testTimeout: 120000
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
