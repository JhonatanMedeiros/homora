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

const password = 'recovery-test-password';
const email = 'admin@homora.test';
const secret = 'oidc-test-secret'.repeat(3);
const run = (...args) =>
  spawnSync(process.execPath, ['scripts/auth-reset.mjs', ...args], { encoding: 'utf8' });

/** An account with a linked identity and an open session. */
async function linkedAccount(path) {
  const db = createDatabase(path);
  const sqlite = getSqliteHandle(db.db);
  const auth = createAuth({ sqlite, secret, webPort: 5173 });
  await auth.setup({ name: 'Admin', email, password });
  await auth.createSessionCookie(email, password);
  const userId = sqlite.prepare('SELECT id FROM "user"').get().id;
  sqlite
    .prepare(
      "INSERT INTO account(id,accountId,providerId,userId,createdAt,updatedAt) VALUES('i1','sub-1','oidc-0123456789abcdef',?,'2026-01-01','2026-01-01')",
    )
    .run(userId);
  db.close();
}

test('--oidc-only removes the link and the sessions but keeps the account and password', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'homora-oidc-reset-'));
  const path = join(dir, 'homora.sqlite');
  try {
    await linkedAccount(path);
    const dry = run(path, '--oidc-only');
    assert.equal(dry.status, 0, dry.stderr);
    assert.match(dry.stdout, /Nothing was changed/);
    const reset = run(path, '--oidc-only', '--yes');
    assert.equal(reset.status, 0, reset.stderr);
    const after = createDatabase(path);
    try {
      const sqlite = getSqliteHandle(after.db);
      assert.equal(
        sqlite.prepare("SELECT COUNT(*) AS n FROM account WHERE providerId LIKE 'oidc-%'").get().n,
        0,
      );
      // The password row of the account stays.
      assert.equal(
        sqlite.prepare("SELECT COUNT(*) AS n FROM account WHERE providerId = 'credential'").get().n,
        1,
      );
      assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM session').get().n, 0);
      assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM "user"').get().n, 1);
      const auth = createAuth({ sqlite, secret, webPort: 5173 });
      assert.ok(await auth.createSessionCookie(email, password));
    } finally {
      after.close();
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('the full account reset leaves no OIDC identity behind', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'homora-oidc-full-reset-'));
  const path = join(dir, 'homora.sqlite');
  try {
    await linkedAccount(path);
    const reset = run(path, '--yes');
    assert.equal(reset.status, 0, reset.stderr);
    const check = new DatabaseSync(path, { readOnly: true });
    try {
      for (const table of ['"user"', 'account', 'session'])
        assert.equal(check.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n, 0, table);
    } finally {
      check.close();
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('the OIDC reset also works on a minimal legacy database', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'homora-oidc-legacy-'));
  const path = join(dir, 'legacy.sqlite');
  try {
    const db = new DatabaseSync(path);
    db.exec(`CREATE TABLE "user" (id TEXT PRIMARY KEY, name TEXT, email TEXT);
      CREATE TABLE account (id TEXT); CREATE TABLE session (id TEXT); CREATE TABLE verification (id TEXT, identifier TEXT, value TEXT);
      INSERT INTO "user" VALUES ('1', 'Admin', 'a@b.c');`);
    db.close();
    for (const args of [['--oidc-only', '--yes'], ['--yes']]) {
      const result = run(path, ...args);
      assert.equal(result.status, 0, result.stderr);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
