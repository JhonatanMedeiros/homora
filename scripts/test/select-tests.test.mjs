import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';

const select = (...files) =>
  execFileSync('node', ['scripts/ci/select-tests.mjs', '--files', files.join(',')], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  })
    .trim()
    .split('\n');

test('files that tests do not import but that can change any result run the whole suite', () => {
  for (const file of [
    'pnpm-lock.yaml',
    'package.json',
    'packages/shared/package.json',
    'tsconfig.json',
    'apps/frontend/tsconfig.json',
    'vitest.config.ts',
    'vitest.setup.ts',
    'turbo.json',
    'packages/db/migrations/0001_init.sql',
    'scripts/ci/run-tests.mjs',
    '.github/workflows/ci.yml',
    '.github/actions/setup/action.yml',
  ])
    assert.deepEqual(select(file), ['ALL'], file);
});

test('a documentation-only change reaches no test', () => {
  assert.deepEqual(select('docs/index.md', 'README.md'), ['NONE']);
});

test('a change in a workspace package selects the tests of every package and app that depends on it', () => {
  // widgets <- integrations <- shared <- backend and frontend: the tests import the compiled
  // `dist`, so only the workspace graph connects them.
  const selected = select('packages/widgets/src/clock.ts');
  for (const area of [
    'packages/integrations/',
    'packages/shared/',
    'apps/backend/',
    'apps/frontend/',
  ])
    assert.ok(
      selected.some((file) => file.startsWith(area) && /\.test\.tsx?$/.test(file)),
      `no test selected under ${area}`,
    );
});

test('a changed test file always runs', () => {
  assert.ok(select('apps/backend/src/vault.test.ts').includes('apps/backend/src/vault.test.ts'));
});

test('source-only UI changes select frontend tests', () => {
  const selected = select('packages/ui/src/components/button.tsx');
  assert.ok(
    selected.some((file) => file.startsWith('apps/frontend/') && /\.test\.tsx?$/.test(file)),
  );
});

test('widget source-only UI changes select frontend tests', () => {
  const selected = select('packages/widgets/src/widgets/note/ui/view.tsx');
  assert.ok(
    selected.some((file) => file.startsWith('apps/frontend/') && /\.test\.tsx?$/.test(file)),
  );
});
