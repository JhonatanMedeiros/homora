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
const { createAuth } = await import('../../apps/backend/src/auth.ts');
const { createDatabase, getSqliteHandle } = await import('../../packages/db/src/index.ts');

const run = (...args) =>
  spawnSync(process.execPath, ['scripts/auth-reset.mjs', ...args], { encoding: 'utf8' });

test('removes the account and sessions only after confirmation and keeps other data', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'homora-auth-reset-'));
  const path = join(dir, 'homora.sqlite');
  try {
    const database = createDatabase(path);
    getSqliteHandle(database.db)
      .prepare('INSERT INTO services (name, url, category, description) VALUES (?, ?, ?, ?)')
      .run('kept', 'https://service.example', 'tests', '');
    const auth = createAuth({
      sqlite: getSqliteHandle(database.db),
      secret: 'reset-test-secret'.repeat(3),
      webPort: 5173,
    });
    await auth.setup({
      name: 'Admin',
      email: 'admin@homora.test',
      password: 'reset-test-password',
    });
    await auth.createSessionCookie('admin@homora.test', 'reset-test-password');
    database.close();

    const dryRun = run(path);
    assert.equal(dryRun.status, 0, dryRun.stderr);
    assert.match(dryRun.stdout, /1 account\(s\)\. Nothing was changed/);

    const reset = run(path, '--yes');
    assert.equal(reset.status, 0, reset.stderr);

    const db = new DatabaseSync(path, { readOnly: true });
    try {
      for (const table of ['"user"', 'account', 'session'])
        assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n, 0, table);
      assert.equal(db.prepare('SELECT name FROM services').get().name, 'kept');
    } finally {
      db.close();
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('fails clearly for a missing database or one without account tables', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'homora-auth-reset-'));
  try {
    const missing = run(join(dir, 'missing.sqlite'), '--yes');
    assert.equal(missing.status, 1);
    const plain = join(dir, 'plain.sqlite');
    const db = new DatabaseSync(plain);
    db.exec('CREATE TABLE services (name TEXT)');
    db.close();
    const result = run(plain, '--yes');
    assert.equal(result.status, 1);
    assert.match(result.stderr, /no account tables/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
