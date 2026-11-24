import { configDefaults, defineConfig } from 'vitest/config';
import { globSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const include = ['apps/**/*.test.{ts,tsx}', 'packages/**/*.test.{ts,tsx}'];

// Test files share one module graph per worker (`isolate: false`), so the app is not reloaded for
// every file. `vi.mock` cannot work in that mode: a module that an earlier file already loaded keeps
// its real imports. Files that mock modules therefore run in their own project with isolation.
// The split is detected from the sources, so a new file that uses `vi.mock` needs no list entry.
const mocksModules = globSync(include, {
  exclude: (name) => name === 'node_modules' || name === 'dist',
})
  .filter((file) => /\bvi\.(mock|doMock)\(/.test(readFileSync(file, 'utf8')))
  .map((file) => file.split('\\').join('/'));

const shared = {
  resolve: { alias: { '@': fileURLToPath(new URL('./apps/frontend/src', import.meta.url)) } },
  test: { setupFiles: ['./vitest.setup.ts'], testTimeout: 15_000 },
};

// Vitest's default `forks` pool needs `child.channel.unref()`, which Bun does not implement yet, and
// more than a few worker threads starve each other on Bun, so Bun runs a small `threads` pool.
const onBun = !!process.versions.bun;

export default defineConfig({
  ...shared,
  test: {
    ...shared.test,
    ...(onBun ? { pool: 'threads' as const, maxWorkers: 4 } : {}),
    projects: [
      {
        ...shared,
        test: {
          ...shared.test,
          name: 'shared',
          include,
          exclude: [...configDefaults.exclude, ...mocksModules],
          isolate: false,
        },
      },
      { ...shared, test: { ...shared.test, name: 'isolated', include: mocksModules } },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: [
        'packages/shared/src/**/*.ts',
        'packages/utils/src/**/*.ts',
        'packages/db/src/**/*.ts',
      ],
    },
  },
});
