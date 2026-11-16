import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { cp, mkdir, mkdtemp, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { after, before, test } from 'node:test';
import { promisify } from 'node:util';

const run = promisify(execFile);
const repo = resolve(import.meta.dirname, '../..');
let sandbox;

// oxlint picks the rules from the file path, so each probe is written at the real path inside a
// temporary tree that holds the real config and the integration descriptors it reads. Nothing is
// written into the repository, where the other script tests scan the same folders in parallel.
before(async () => {
  sandbox = await mkdtemp(join(tmpdir(), 'homora-oxlint-boundaries-'));
  await cp(join(repo, 'oxlint.config.ts'), join(sandbox, 'oxlint.config.ts'));
  await symlink(join(repo, 'node_modules'), join(sandbox, 'node_modules'), 'dir');
  const source = join(repo, 'packages/integrations/src/integrations');
  for (const entry of await readdir(source, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const target = join(sandbox, 'packages/integrations/src/integrations', entry.name);
    await mkdir(target, { recursive: true });
    await cp(join(source, entry.name, 'integration.json'), join(target, 'integration.json')).catch(
      (error) => {
        if (error.code !== 'ENOENT') throw error;
      },
    );
  }
});
after(() => rm(sandbox, { recursive: true, force: true }));

let probe = 0;
async function restricted(file, source) {
  const target = join(sandbox, file.replace(/boundary-probe/, `boundary-probe-${probe++}`));
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, source);
  const { stdout } = await run(join(repo, 'node_modules/.bin/oxlint'), ['-f', 'json', target], {
    cwd: sandbox,
    maxBuffer: 1 << 24,
  }).catch((error) => error);
  return JSON.parse(stdout).diagnostics.filter((d) => d.code === 'eslint(no-restricted-imports)');
}

test('oxlint enforces integration imports without blocking test helpers or capability rules', async () => {
  const sdk = 'packages/integrations/src/boundary-probe.ts';
  const widget = 'packages/widgets/src/boundary-probe.test.ts';
  const backend = 'apps/backend/src/boundary-probe.ts';
  const frontend = 'apps/frontend/src/boundary-probe.ts';
  assert.equal((await restricted(sdk, "import type { DB } from '@homora/db';")).length, 1);
  assert.equal(
    (await restricted(widget, "import type { X } from '@homora/integrations';")).length,
    1,
  );
  assert.equal(
    (await restricted(widget, "import type { X } from '../../integrations/src/index.js';")).length,
    1,
  );
  assert.equal((await restricted(widget, "import type { X } from './index.js';")).length, 0);
  assert.equal(
    (await restricted(sdk, "import type { DB } from '../../../apps/backend/src/db.js';")).length,
    1,
  );
  assert.equal(
    (
      await restricted(
        'packages/integrations/src/boundary-probe.test.ts',
        "import type { DB } from '../../../apps/backend/src/db.js';",
      )
    ).length,
    1,
  );
  assert.equal(
    (
      await restricted(
        backend,
        "import type { T } from '@homora/integrations/definitions/uptime-kuma';",
      )
    ).length,
    1,
  );
  assert.equal(
    (await restricted(frontend, "import type { T } from '@homora/integrations/proxmox/inventory';"))
      .length,
    1,
  );
  assert.equal(
    (
      await restricted(
        'apps/backend/src/boundary-probe.test.ts',
        "import type { T } from '@homora/integrations/proxmox/inventory';",
      )
    ).length,
    0,
  );
  assert.equal(
    (await restricted(backend, "import type { T } from './monitoring/probe.js';")).length,
    1,
  );
  assert.equal(
    (await restricted(backend, "import type { T } from '@homora/integrations/backend';")).length,
    0,
  );
});
