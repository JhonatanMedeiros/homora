import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateCatalog } from '../../packages/integrations/scripts/integration-catalog.mjs';

test('generates deterministic opt-in catalogs and rejects malformed descriptors', async () => {
  const root = await mkdtemp(join(tmpdir(), 'homora-catalog-'));
  try {
    const source = join(root, 'packages/integrations/src');
    await mkdir(join(source, 'generated'), { recursive: true });
    for (const [id, order] of [
      ['alpha', 20],
      ['beta', 10],
    ]) {
      const folder = join(source, 'integrations', id);
      await mkdir(folder, { recursive: true });
      await writeFile(join(folder, 'definition.ts'), '');
      await writeFile(join(folder, 'registration.ts'), '');
      await writeFile(join(folder, 'frontend.ts'), '');
      await writeFile(join(folder, 'messages.ts'), '');
      await writeFile(join(folder, 'development.ts'), '');
      await writeFile(join(folder, 'mcp.ts'), '');
      await writeFile(
        join(folder, 'integration.json'),
        JSON.stringify({
          type: id,
          order,
          definition: `${id}Def`,
          backend: 'register',
          frontend: 'present',
          translations: true,
          development: true,
          mcp: 'tools',
          scopes: [
            {
              id: `${id}:read`,
              label: `${id}.label`,
              hint: `${id}.hint`,
              labelFallback: 'Read',
              hintFallback: 'Read data',
            },
          ],
        }),
      );
    }
    await mkdir(join(source, 'integrations/unregistered'));
    await generateCatalog(root, true);
    await generateCatalog(root);
    const definitions = await readFile(join(source, 'generated/definitions.ts'), 'utf8');
    assert.ok(
      definitions.indexOf('definition: betaDef') < definitions.indexOf('definition: alphaDef'),
    );
    assert.doesNotMatch(definitions, /unregistered/);
    assert.match(await readFile(join(source, 'generated/backend.ts'), 'utf8'), /registration\.js/);
    assert.match(await readFile(join(source, 'generated/frontend.ts'), 'utf8'), /frontend\.js/);
    assert.match(
      await readFile(join(source, 'generated/translations.ts'), 'utf8'),
      /alpha\/messages\.js/,
    );
    assert.match(
      await readFile(join(source, 'generated/development.ts'), 'utf8'),
      /beta\/development\.js/,
    );
    assert.match(await readFile(join(source, 'generated/mcp.ts'), 'utf8'), /alpha\/mcp\.js/);
    assert.match(definitions, /alpha:read/);
    await writeFile(join(source, 'generated/frontend.ts'), 'stale');
    await assert.rejects(generateCatalog(root), /catalog is stale/);
    await writeFile(
      join(source, 'integrations/alpha/integration.json'),
      JSON.stringify({ type: 'alpha', order: 10, definition: 'alphaDef' }),
    );
    await assert.rejects(generateCatalog(root, true), /order values must be unique/);
    await writeFile(
      join(source, 'integrations/alpha/integration.json'),
      JSON.stringify({ type: '../oops', order: 30, definition: 'x' }),
    );
    await assert.rejects(generateCatalog(root, true), /Invalid integration descriptor/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
