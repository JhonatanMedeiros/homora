import { defineConfig } from 'vitest/config';

// Backend and package tests only: no DOM setup, so they can run on any runtime (Node or Bun).
export default defineConfig({
  test: {
    include: ['apps/backend/src/**/*.test.ts', 'packages/*/src/**/*.test.ts'],
    environment: 'node',
  },
});
