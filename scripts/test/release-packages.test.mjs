import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { checkReleasePackages } from '../check-release-packages.mjs';

const repoRoot = resolve(import.meta.dirname, '../..');

async function createFixture({
  backendVersion = '0.4.0',
  manifestVersion = '0.4.0',
  extraPackages = [],
  listedPaths = ['apps/backend/package.json'],
}) {
  const dir = await mkdtemp(join(tmpdir(), 'homora-release-pkgs-'));
  await mkdir(join(dir, 'apps/backend'), { recursive: true });
  await writeFile(
    join(dir, 'apps/backend/package.json'),
    JSON.stringify({ name: '@homora/backend', version: backendVersion }),
  );
  await writeFile(
    join(dir, '.release-please-manifest.json'),
    JSON.stringify({ '.': manifestVersion }),
  );
  await writeFile(
    join(dir, 'release-please-config.json'),
    JSON.stringify({
      packages: {
        '.': {
          'extra-files': listedPaths.map((path) => ({
            type: 'json',
            path,
            jsonpath: '$.version',
          })),
        },
      },
    }),
  );
  for (const pkg of extraPackages) {
    await mkdir(join(dir, pkg.dir), { recursive: true });
    const content = { name: pkg.name };
    if (pkg.version !== undefined) content.version = pkg.version;
    await writeFile(join(dir, pkg.dir, 'package.json'), JSON.stringify(content));
  }
  return dir;
}

test('repository workspace packages are all listed in release-please-config.json with matching versions', () => {
  const result = checkReleasePackages(repoRoot);
  assert.equal(result.ok, true, result.errors.join('\n'));
  assert.ok(result.packages.length >= 10);
});

test('fails when a new versioned package is not listed in release-please-config.json', async () => {
  const dir = await createFixture({
    extraPackages: [{ dir: 'packages/new-pkg', name: '@homora/new-pkg', version: '0.4.0' }],
    listedPaths: ['apps/backend/package.json'],
  });
  try {
    const result = checkReleasePackages(dir);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((error) => error.includes('packages/new-pkg/package.json')));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('fails when a workspace package has a divergent version', async () => {
  const dir = await createFixture({
    extraPackages: [{ dir: 'packages/shared', name: '@homora/shared', version: '0.1.0' }],
    listedPaths: ['apps/backend/package.json', 'packages/shared/package.json'],
  });
  try {
    const result = checkReleasePackages(dir);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((error) => error.includes('packages/shared/package.json')));
    assert.ok(result.errors.some((error) => error.includes('0.1.0')));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('fails when .release-please-manifest.json diverges from apps/backend/package.json', async () => {
  const dir = await createFixture({
    backendVersion: '0.4.0',
    manifestVersion: '0.3.0',
    listedPaths: ['apps/backend/package.json'],
  });
  try {
    const result = checkReleasePackages(dir);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((error) => error.includes('.release-please-manifest.json')));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('ignores workspace packages without a version field', async () => {
  const dir = await createFixture({
    extraPackages: [{ dir: 'packages/unversioned', name: '@homora/unversioned' }],
    listedPaths: ['apps/backend/package.json'],
  });
  try {
    const result = checkReleasePackages(dir);
    assert.equal(result.ok, true, result.errors.join('\n'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
