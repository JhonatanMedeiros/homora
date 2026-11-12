import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { register } from 'node:module';

// Backend code imports './x.js' (resolved to .ts by TypeScript); Node requires the same mapping.
register(
  'data:text/javascript,' +
    encodeURIComponent(`export async function resolve(specifier, context, next) {
      try { return await next(specifier, context); }
      catch (error) {
        if (specifier.startsWith('.') && specifier.endsWith('.js')) {
          return next(specifier.slice(0, -3) + '.ts', context);
        }
        throw error;
      }
    }`),
);
const { createDatabase } = await import('../../packages/db/src/index.ts');

const run = (...args) =>
  spawnSync(process.execPath, ['scripts/css-reset.mjs', ...args], { encoding: 'utf8' });

test('turns custom CSS off, keeps its text and records the event', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'homora-css-reset-'));
  const path = join(dir, 'homora.sqlite');
  const css = '[data-homora="top-bar"] { display: none; }';
  try {
    const database = createDatabase(path);
    database.close();
    const db = new DatabaseSync(path);
    db.prepare("INSERT INTO app_settings(key,value) VALUES('custom_css', ?)").run(css);
    db.prepare("INSERT INTO app_settings(key,value) VALUES('custom_css_enabled','true')").run();
    db.close();

    const result = run(path);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /turned off/);

    const after = new DatabaseSync(path, { readOnly: true });
    const read = (key) =>
      after.prepare('SELECT value FROM app_settings WHERE key = ?').get(key)?.value;
    assert.equal(read('custom_css_enabled'), 'false');
    assert.equal(read('custom_css'), css);
    const event = after
      .prepare("SELECT action, result, detail FROM audit_events WHERE action = 'custom-css-reset'")
      .get();
    assert.deepEqual(
      { ...event },
      {
        action: 'custom-css-reset',
        result: 'ok',
        detail: 'cli: disabled',
      },
    );
    after.close();

    const again = run(path);
    assert.equal(again.status, 0);
    assert.match(again.stdout, /already off/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('works when custom CSS was never set, and fails clearly for a missing database', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'homora-css-reset-empty-'));
  const path = join(dir, 'homora.sqlite');
  try {
    createDatabase(path).close();
    assert.equal(run(path).status, 0);
    const missing = run(join(dir, 'nope.sqlite'));
    assert.notEqual(missing.status, 0);
    assert.ok(missing.stderr.length > 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
