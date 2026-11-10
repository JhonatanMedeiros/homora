import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./apps/frontend/src', import.meta.url)) } },
  test: {
    include: ['apps/**/*.test.{ts,tsx}', 'packages/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['packages/shared/src/**/*.ts', 'packages/db/src/**/*.ts'],
    },
  },
});
