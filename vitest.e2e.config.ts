import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/e2e/**/*.e2e.ts'],
    globals: false,
    passWithNoTests: false,
    setupFiles: ['./tests/e2e/setup.ts']
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
