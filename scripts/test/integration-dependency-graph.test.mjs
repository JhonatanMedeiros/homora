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

test('widget SDK has no direct or transitive dependency on applications or integrations', async () => {
  const graph = await workspaceGraph(resolve(import.meta.dirname, '../..'));
  assert.equal(graph.has('@homora/widgets'), true);
  assert.equal(
    findForbiddenPath(graph, '@homora/widgets', new Set([...forbidden, '@homora/integrations'])),
    null,
  );
});

test('UI has no dependency on applications or domain packages', async () => {
  const graph = await workspaceGraph(resolve(import.meta.dirname, '../..'));
  assert.equal(graph.has('@homora/ui'), true);
  assert.equal(
    findForbiddenPath(
      graph,
      '@homora/ui',
      new Set([...forbidden, '@homora/integrations', '@homora/widgets']),
    ),
    null,
  );
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
    const widgets = await workspace('packages', 'widgets', '@homora/widgets');
    const ui = await workspace('packages', 'ui', '@homora/ui');
    await workspace('apps', 'frontend', '@homora/frontend');
    await writeFile(join(ui, 'src', 'probe.ts'), "import '../../../apps/frontend/src/app';");
    assert.deepEqual(findForbiddenPath(await workspaceGraph(root), '@homora/ui', forbidden), [
      '@homora/ui',
      '@homora/frontend',
    ]);
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
    await writeFile(join(widgets, 'src', 'index.ts'), "import '@homora/middle';");
    await writeFile(
      join(middle, 'package.json'),
      JSON.stringify({
        name: '@homora/middle',
        dependencies: { '@homora/integrations': 'workspace:*' },
      }),
    );
    assert.deepEqual(
      findForbiddenPath(
        await workspaceGraph(root),
        '@homora/widgets',
        new Set([...forbidden, '@homora/integrations']),
      ),
      ['@homora/widgets', '@homora/middle', '@homora/integrations'],
    );
    await writeFile(join(sdk, 'src', 'index.ts'), "import('@homora/backend');");
    assert.deepEqual(
      findForbiddenPath(await workspaceGraph(root), '@homora/integrations', forbidden),
      ['@homora/integrations', '@homora/backend'],
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('backend and compiled widget sources do not import React or widget UI', async () => {
  const root = resolve(import.meta.dirname, '../..');
  const forbiddenImport =
    /(?:from\s*|import\s*(?:\(\s*)?|require\s*\(\s*)['"](?:react(?:\/[^'"]*)?|react-dom(?:\/[^'"]*)?|@homora\/ui(?:\/[^'"]*)?|@homora\/widgets\/(?:ui|[^'"]*\/ui(?:\/[^'"]*)?)|(?:\.\.?\/)+[^'"]*\/ui(?:\/[^'"]*)?)['"]/;
  for (const probe of [
    "import 'react'",
    "import x from '@homora/ui/button'",
    "import('@homora/widgets/clock/ui')",
  ])
    assert.match(probe, forbiddenImport);
  async function scan(folder, skipUi) {
    const { readdir, readFile } = await import('node:fs/promises');
    const entries = await readdir(folder, { withFileTypes: true });
    for (const entry of entries) {
      if (skipUi && entry.isDirectory() && entry.name === 'ui') continue;
      const path = join(folder, entry.name);
      if (entry.isDirectory()) await scan(path, skipUi);
      else if (/\.[cm]?[jt]sx?$/.test(entry.name) && !/\.(test|spec)\.[jt]sx?$/.test(entry.name)) {
        const text = await readFile(path, 'utf8');
        assert.doesNotMatch(text, forbiddenImport, path);
      }
    }
  }
  await scan(join(root, 'apps/backend/src'), false);
  await scan(join(root, 'packages/widgets/src'), true);
  for (const name of ['integrations', 'shared', 'i18n', 'db', 'icons'])
    await scan(join(root, 'packages', name, 'src'), false);
});
