import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.spec.ts'],
    globals: true,
    setupFiles: ['tests/setup.ts']
  },
  resolve: {
    alias: {
      'obsidian': './node_modules/obsidian'
    }
  }
});
