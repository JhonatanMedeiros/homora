import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createIntegration } from '../create-integration.mjs';

test('creates unregistered manifest and code skeletons without overwriting', async () => {
  const root = await mkdtemp(join(tmpdir(), 'homora-integration-'));
  try {
    const manifest = await createIntegration(root, 'my-service', 'manifest');
    const original = await readFile(join(manifest, 'definition.ts'), 'utf8');
    assert.match(original, /kind: 'manifest'/);
    assert.match(
      await readFile(join(manifest, 'contract.test.ts.example'), 'utf8'),
      /runAdapterContract/,
    );
    assert.match(await readFile(join(manifest, 'fixtures/example.json'), 'utf8'), /illustrative/);
    await assert.rejects(createIntegration(root, 'my-service', 'manifest'), { code: 'EEXIST' });
    assert.equal(await readFile(join(manifest, 'definition.ts'), 'utf8'), original);
    const code = await createIntegration(root, 'other-service', 'code');
    assert.match(await readFile(join(code, 'backend.ts.example'), 'utf8'), /context\.transport/);
    assert.match(await readFile(join(code, 'frontend.ts.example'), 'utf8'), /definePresentation/);
    assert.match(await readFile(join(code, 'contract.test.ts.example'), 'utf8'), /createAdapter/);
    for (const id of ['../outside', 'x', 'a/b', 'a--b', 'Upper'])
      await assert.rejects(createIntegration(root, id, 'manifest'));
    await assert.rejects(createIntegration(root, 'valid-name', 'invalid'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('generated definitions compile against the SDK without modifying the repository', async () => {
  const root = await mkdtemp(join(tmpdir(), 'homora-integration-build-'));
  const repo = resolve(import.meta.dirname, '../..');
  try {
    const target = join(root, 'packages/integrations');
    await mkdir(target, { recursive: true });
    await cp(join(repo, 'packages/integrations/src'), join(target, 'src'), { recursive: true });
    await cp(join(repo, 'packages/integrations/tsconfig.json'), join(target, 'tsconfig.json'));
    await cp(join(repo, 'tsconfig.json'), join(root, 'tsconfig.json'));
    await symlink(join(repo, 'node_modules'), join(root, 'node_modules'), 'dir');
    await createIntegration(root, 'example-manifest', 'manifest');
    const code = await createIntegration(root, 'example-code', 'code');
    await cp(join(code, 'backend.ts.example'), join(code, 'backend.ts'));
    await cp(join(code, 'frontend.ts.example'), join(code, 'frontend.ts'));
    await promisify(execFile)(join(repo, 'node_modules/.bin/tsc'), [
      '-p',
      join(target, 'tsconfig.json'),
      '--noEmit',
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
