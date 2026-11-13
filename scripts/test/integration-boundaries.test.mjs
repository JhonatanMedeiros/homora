import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

async function sourceFiles(folder) {
  const entries = await readdir(folder, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(folder, entry.name);
      if (entry.isDirectory()) return sourceFiles(path);
      return /\.[cm]?[jt]sx?$/.test(entry.name) && !/\.(test|spec)\./.test(entry.name)
        ? [path]
        : [];
    }),
  );
  return files.flat();
}

test('applications do not import or dispatch individual built-in integrations', async () => {
  const root = resolve(import.meta.dirname, '../..');
  const integrationDir = join(root, 'packages/integrations/src/integrations');
  const types = [];
  for (const entry of await readdir(integrationDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    try {
      const descriptor = JSON.parse(
        await readFile(join(integrationDir, entry.name, 'integration.json'), 'utf8'),
      );
      types.push(descriptor.type);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  const files = (
    await Promise.all(
      ['apps/backend/src', 'apps/frontend/src'].map((folder) => sourceFiles(join(root, folder))),
    )
  ).flat();
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    for (const type of types) {
      assert.doesNotMatch(
        source,
        new RegExp(`from ['"]@homora/integrations/${type}(?:/[^'"]*)?['"]`),
        file,
      );
      assert.doesNotMatch(source, new RegExp(`\\btype\\s*={2,3}\\s*['"]${type}['"]`), file);
    }
  }
});
