import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const script = resolve('scripts/check-release-version.mjs');

test('release tag must match all version sources', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'homora-release-'));
  try {
    await mkdir(join(dir, 'apps/backend'), { recursive: true });
    const writeVersions = async (version, manifestVersion = version) => {
      await writeFile(join(dir, 'apps/backend/package.json'), JSON.stringify({ version }));
      await writeFile(
        join(dir, '.release-please-manifest.json'),
        JSON.stringify({ '.': manifestVersion }),
      );
      await writeFile(join(dir, 'version.txt'), `${version}\n`);
    };
    const check = (tag) =>
      spawnSync(process.execPath, [script], { cwd: dir, env: { ...process.env, RELEASE_TAG: tag } })
        .status;
    await writeVersions('0.1.0');
    assert.equal(check('v0.1.0'), 0);
    assert.equal(check('0.1.0'), 1);
    assert.equal(check('v0.1.01'), 1);
    assert.equal(check('v0.1.1'), 1);
    await writeVersions('0.2.0-beta.1');
    assert.equal(check('v0.2.0-beta.1'), 0);
    assert.equal(check('v0.2.0-beta.01'), 1);
    await writeVersions('0.1.0', '0.0.0');
    assert.equal(check('v0.1.0'), 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
