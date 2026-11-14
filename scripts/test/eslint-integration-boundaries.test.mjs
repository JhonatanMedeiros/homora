import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ESLint } from 'eslint';
import { resolve } from 'node:path';

const lint = new ESLint();
async function restricted(file, source) {
  const [result] = await lint.lintText(source, { filePath: resolve(file) });
  return result.messages.filter((message) => message.ruleId === 'no-restricted-imports');
}

test('ESLint enforces integration imports without blocking test helpers or capability rules', async () => {
  const sdk = 'packages/integrations/src/boundary-probe.ts';
  const backend = 'apps/backend/src/boundary-probe.ts';
  const frontend = 'apps/frontend/src/boundary-probe.ts';
  assert.equal((await restricted(sdk, "import type { DB } from '@homora/db';")).length, 1);
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
    0,
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
