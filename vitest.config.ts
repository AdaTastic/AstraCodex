import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.spec.ts'],
    exclude: ['tests/e2e/**'],
    globals: false,
    passWithNoTests: true
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
