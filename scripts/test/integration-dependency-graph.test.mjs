import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { findForbiddenPath, workspaceGraph } from '../integration-dependency-graph.mjs';

const forbidden = new Set(['@homora/backend', '@homora/frontend', '@homora/db', '@homora/shared']);
test('integration SDK has no direct or transitive runtime dependency on host packages', async () => {
  const graph = await workspaceGraph(resolve(import.meta.dirname, '../..'));
  assert.equal(graph.has('@homora/integrations'), true);
  assert.equal(findForbiddenPath(graph, '@homora/integrations', forbidden), null);
});

test('detects indirect workspace dependencies and source imports, and handles cycles', async () => {
  const root = await mkdtemp(join(tmpdir(), 'homora-graph-'));
  try {
    for (const parent of ['apps', 'packages']) await mkdir(join(root, parent));
    async function workspace(parent, dir, name, dependencies = {}) {
      const folder = join(root, parent, dir);
      await mkdir(join(folder, 'src'), { recursive: true });
      await writeFile(join(folder, 'package.json'), JSON.stringify({ name, dependencies }));
      return folder;
    }
    const sdk = await workspace('packages', 'integrations', '@homora/integrations', {
      '@homora/middle': 'workspace:*',
    });
    const middle = await workspace('packages', 'middle', '@homora/middle', {
      '@homora/integrations': 'workspace:*',
    });
    await workspace('apps', 'backend', '@homora/backend');
    assert.equal(
      findForbiddenPath(await workspaceGraph(root), '@homora/integrations', forbidden),
      null,
    );
    await writeFile(
      join(middle, 'src', 'index.ts'),
      "export * from '../../../apps/backend/src/index.js';",
    );
    assert.deepEqual(
      findForbiddenPath(await workspaceGraph(root), '@homora/integrations', forbidden),
      ['@homora/integrations', '@homora/middle', '@homora/backend'],
    );
    await writeFile(join(sdk, 'src', 'ignore.test.ts'), "import '@homora/backend';");
    await writeFile(join(middle, 'src', 'index.ts'), '');
    assert.equal(
      findForbiddenPath(await workspaceGraph(root), '@homora/integrations', forbidden),
      null,
    );
    await writeFile(
      join(middle, 'package.json'),
      JSON.stringify({
        name: '@homora/middle',
        dependencies: { '@homora/backend': 'workspace:*' },
      }),
    );
    assert.deepEqual(
      findForbiddenPath(await workspaceGraph(root), '@homora/integrations', forbidden),
      ['@homora/integrations', '@homora/middle', '@homora/backend'],
    );
    await writeFile(join(middle, 'package.json'), JSON.stringify({ name: '@homora/middle' }));
    await writeFile(join(sdk, 'src', 'index.ts'), "import('@homora/backend');");
    assert.deepEqual(
      findForbiddenPath(await workspaceGraph(root), '@homora/integrations', forbidden),
      ['@homora/integrations', '@homora/backend'],
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
