import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createWidget } from '../create-widget.mjs';

const repo = resolve(import.meta.dirname, '../..');
test('creates and registers a widget once, rejecting invalid names', async () => {
  const root = await mkdtemp(join(tmpdir(), 'homora-widget-'));
  try {
    for (const path of [
      'packages/widgets/src/registry.ts',
      'packages/widgets/src/translations.ts',
      'packages/widgets/package.json',
      'apps/frontend/src/components/widget-ui-registry.tsx',
    ]) {
      await mkdir(join(root, path, '..'), { recursive: true });
      await cp(join(repo, path), join(root, path));
    }
    await mkdir(join(root, 'packages/widgets/src/widgets'), { recursive: true });
    const target = await createWidget(root, 'test-generated-widget');
    assert.match(await readFile(join(target, 'definition.ts'), 'utf8'), /test-generated-widget/);
    for (const path of [
      'packages/widgets/src/registry.ts',
      'packages/widgets/src/translations.ts',
      'packages/widgets/package.json',
      'apps/frontend/src/components/widget-ui-registry.tsx',
    ])
      assert.match(await readFile(join(root, path), 'utf8'), /test-generated-widget/);
    const before = await readFile(join(root, 'packages/widgets/src/registry.ts'), 'utf8');
    await assert.rejects(createWidget(root, 'test-generated-widget'));
    assert.equal(await readFile(join(root, 'packages/widgets/src/registry.ts'), 'utf8'), before);
    for (const name of ['x', '../bad', 'UPPER', 'a--b'])
      await assert.rejects(createWidget(root, name));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
