import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.spec.ts'],
    globals: false,
    passWithNoTests: false
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
