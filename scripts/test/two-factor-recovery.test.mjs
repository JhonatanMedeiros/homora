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
const { totpCode } = await import('../../apps/backend/src/test-totp.ts');
const { createDatabase, getSqliteHandle } = await import('../../packages/db/src/index.ts');

const password = 'recovery-test-password';
const email = 'admin@homora.test';
const secretA = 'recovery-test-secret-a'.repeat(3);
const secretB = 'recovery-test-secret-b'.repeat(3);
const origin = 'http://localhost:5173';
const run = (script, ...args) =>
  spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });

const makeAuth = (db, secret) => createAuth({ sqlite: getSqliteHandle(db), secret, webPort: 5173 });

/** Calls a Better Auth route directly and returns the JSON body and cookies. */
async function call(auth, path, body, cookie) {
  const response = await auth.handler(
    new Request(`${origin}/api/auth${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin, ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body),
    }),
  );
  const cookies = response.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .filter((pair) => !pair.endsWith('='))
    .join('; ');
  return { status: response.status, json: await response.json().catch(() => null), cookies };
}

/** Creates the account with the authenticator app turned on; returns what a user would hold. */
async function accountWithTwoFactor(db, secret) {
  const auth = makeAuth(db, secret);
  await auth.setup({ name: 'Administrator', email, password });
  const cookie = await auth.createSessionCookie(email, password);
  const started = await call(auth, '/two-factor/enable', { password }, cookie);
  const authenticatorSecret = new URL(started.json.totpURI).searchParams.get('secret');
  const confirmed = await call(
    auth,
    '/two-factor/verify-totp',
    { code: totpCode(authenticatorSecret) },
    cookie,
  );
  assert.equal(confirmed.status, 200);
  return { authenticatorSecret, recoveryCodes: started.json.backupCodes };
}

/** Password step, then a code: true when the sign-in completes. */
async function signInWith(auth, body, route = '/two-factor/verify-totp') {
  const first = await call(auth, '/sign-in/email', { email, password, rememberMe: false });
  assert.equal(first.json.twoFactorRedirect, true);
  return (await call(auth, route, body, first.cookies)).status === 200;
}

test('a restored backup keeps two-factor sign-in with the same session secret and breaks without it', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'homora-2fa-restore-'));
  const source = join(dir, 'source.sqlite');
  const backup = join(dir, 'backup.sqlite');
  const restored = join(dir, 'restored.sqlite');
  try {
    const db = createDatabase(source);
    const { authenticatorSecret, recoveryCodes } = await accountWithTwoFactor(db.db, secretA);
    db.close();
    assert.equal(run('scripts/backup.mjs', source, backup).status, 0);
    assert.equal(run('scripts/backup.mjs', backup, restored).status, 0);

    const restoredDb = createDatabase(restored);
    try {
      const auth = makeAuth(restoredDb.db, secretA);
      assert.ok(await signInWith(auth, { code: totpCode(authenticatorSecret) }));
      assert.ok(
        await signInWith(auth, { code: recoveryCodes[0] }, '/two-factor/verify-backup-code'),
      );
      // A restored copy opened with another secret cannot decrypt the authenticator secret:
      // nothing is accepted, which is why the secret is backed up with the database.
      const lost = makeAuth(restoredDb.db, secretB);
      assert.equal(await signInWith(lost, { code: totpCode(authenticatorSecret) }), false);
      assert.equal(
        await signInWith(lost, { code: recoveryCodes[1] }, '/two-factor/verify-backup-code'),
        false,
      );
    } finally {
      restoredDb.close();
    }

    // Local recovery: the account and password stay, only the second step is removed.
    const dryRun = run('scripts/auth-reset.mjs', restored, '--two-factor-only');
    assert.equal(dryRun.status, 0, dryRun.stderr);
    assert.match(dryRun.stdout, /Nothing was changed/);
    const reset = run('scripts/auth-reset.mjs', restored, '--two-factor-only', '--yes');
    assert.equal(reset.status, 0, reset.stderr);
    const after = createDatabase(restored);
    try {
      const sqlite = getSqliteHandle(after.db);
      assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM "twoFactor"').get().n, 0);
      assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM session').get().n, 0);
      assert.equal(
        sqlite.prepare("SELECT COUNT(*) AS n FROM verification WHERE identifier LIKE '2fa-%'").get()
          .n,
        0,
      );
      assert.equal(sqlite.prepare('SELECT twoFactorEnabled AS on_ FROM "user"').get().on_, 0);
      const auth = makeAuth(after.db, secretB);
      assert.ok(await auth.createSessionCookie(email, password));
      const again = await call(auth, '/sign-in/email', { email, password, rememberMe: false });
      assert.equal(again.json.twoFactorRedirect, undefined);
    } finally {
      after.close();
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('the full account reset leaves no authenticator secret or recovery code behind', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'homora-2fa-reset-'));
  const path = join(dir, 'homora.sqlite');
  try {
    const db = createDatabase(path);
    await accountWithTwoFactor(db.db, secretA);
    // A pending sign-in challenge must not survive either.
    await call(makeAuth(db.db, secretA), '/sign-in/email', { email, password, rememberMe: false });
    db.close();
    const reset = run('scripts/auth-reset.mjs', path, '--yes');
    assert.equal(reset.status, 0, reset.stderr);
    const check = new DatabaseSync(path, { readOnly: true });
    try {
      for (const table of ['"twoFactor"', '"user"', 'account', 'session', 'verification'])
        assert.equal(check.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n, 0, table);
    } finally {
      check.close();
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('the reset also works on a database from before two-factor authentication existed', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'homora-2fa-legacy-'));
  const path = join(dir, 'legacy.sqlite');
  try {
    const db = new DatabaseSync(path);
    db.exec(`CREATE TABLE "user" (id TEXT PRIMARY KEY, name TEXT, email TEXT);
      CREATE TABLE account (id TEXT); CREATE TABLE session (id TEXT); CREATE TABLE verification (id TEXT, identifier TEXT);
      INSERT INTO "user" VALUES ('1', 'Admin', 'a@b.c');`);
    db.close();
    for (const args of [['--two-factor-only', '--yes'], ['--yes']]) {
      const result = run('scripts/auth-reset.mjs', path, ...args);
      assert.equal(result.status, 0, result.stderr);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
