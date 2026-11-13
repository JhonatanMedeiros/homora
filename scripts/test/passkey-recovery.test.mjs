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
const { createVirtualAuthenticator } = await import('../../apps/backend/src/test-passkey.ts');
const { createDatabase, getSqliteHandle } = await import('../../packages/db/src/index.ts');

const password = 'recovery-test-password';
const email = 'admin@homora.test';
const secretA = 'passkey-test-secret-a'.repeat(3);
const secretB = 'passkey-test-secret-b'.repeat(3);
const origin = 'http://localhost:5173';
const run = (script, ...args) =>
  spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
const makeAuth = (db, secret) => createAuth({ sqlite: getSqliteHandle(db), secret, webPort: 5173 });

async function call(auth, method, path, body, cookie) {
  const response = await auth.handler(
    new Request(`${origin}/api/auth${path}`, {
      method,
      headers: {
        ...(body ? { 'content-type': 'application/json' } : {}),
        origin,
        ...(cookie ? { cookie } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    }),
  );
  const cookies = response.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .filter((pair) => !pair.endsWith('='))
    .join('; ');
  return { status: response.status, json: await response.json().catch(() => null), cookies };
}

/** Creates the account with one passkey and returns the authenticator that holds it. */
async function accountWithPasskey(db, secret) {
  const auth = makeAuth(db, secret);
  await auth.setup({ name: 'Administrator', email, password });
  const cookie = await auth.createSessionCookie(email, password);
  const authenticator = createVirtualAuthenticator();
  const started = await call(auth, 'GET', '/passkey/generate-register-options', undefined, cookie);
  assert.equal(started.status, 200);
  const added = await call(
    auth,
    'POST',
    '/passkey/verify-registration',
    { response: authenticator.register(started.json), name: 'Laptop' },
    `${cookie}; ${started.cookies}`,
  );
  assert.equal(added.status, 200);
  return authenticator;
}

async function signInWithPasskey(auth, authenticator, signCount = 1) {
  const challenge = await call(auth, 'GET', '/passkey/generate-authenticate-options');
  const result = await call(
    auth,
    'POST',
    '/passkey/verify-authentication',
    { response: authenticator.assert(challenge.json, { signCount }) },
    challenge.cookies,
  );
  return result.status === 200;
}

test('a restored backup keeps passkeys, which do not depend on the session secret', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'homora-passkey-restore-'));
  const source = join(dir, 'source.sqlite');
  const backup = join(dir, 'backup.sqlite');
  const restored = join(dir, 'restored.sqlite');
  try {
    const db = createDatabase(source);
    const authenticator = await accountWithPasskey(db.db, secretA);
    db.close();
    assert.equal(run('scripts/backup.mjs', source, backup).status, 0);
    assert.equal(run('scripts/backup.mjs', backup, restored).status, 0);
    const restoredDb = createDatabase(restored);
    try {
      assert.ok(await signInWithPasskey(makeAuth(restoredDb.db, secretA), authenticator, 1));
      // Only the public key is stored, so another session secret still verifies the assertion.
      assert.ok(await signInWithPasskey(makeAuth(restoredDb.db, secretB), authenticator, 2));
    } finally {
      restoredDb.close();
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('--passkeys-only removes every passkey and session but keeps the account and password', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'homora-passkey-only-'));
  const path = join(dir, 'homora.sqlite');
  try {
    const db = createDatabase(path);
    const authenticator = await accountWithPasskey(db.db, secretA);
    // A pending challenge must not survive either.
    await call(makeAuth(db.db, secretA), 'GET', '/passkey/generate-authenticate-options');
    db.close();
    const dry = run('scripts/auth-reset.mjs', path, '--passkeys-only');
    assert.equal(dry.status, 0, dry.stderr);
    assert.match(dry.stdout, /Nothing was changed/);
    const reset = run('scripts/auth-reset.mjs', path, '--passkeys-only', '--yes');
    assert.equal(reset.status, 0, reset.stderr);
    const after = createDatabase(path);
    try {
      const sqlite = getSqliteHandle(after.db);
      assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM passkey').get().n, 0);
      assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM session').get().n, 0);
      assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM verification').get().n, 0);
      assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM "user"').get().n, 1);
      const auth = makeAuth(after.db, secretA);
      assert.ok(await auth.createSessionCookie(email, password));
      assert.equal(await signInWithPasskey(auth, authenticator, 3), false);
    } finally {
      after.close();
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('the full account reset leaves no passkey behind', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'homora-passkey-reset-'));
  const path = join(dir, 'homora.sqlite');
  try {
    const db = createDatabase(path);
    await accountWithPasskey(db.db, secretA);
    db.close();
    const reset = run('scripts/auth-reset.mjs', path, '--yes');
    assert.equal(reset.status, 0, reset.stderr);
    const check = new DatabaseSync(path, { readOnly: true });
    try {
      for (const table of ['passkey', '"user"', 'account', 'session', 'verification'])
        assert.equal(check.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n, 0, table);
    } finally {
      check.close();
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('the passkey reset also works on a database from before passkeys existed', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'homora-passkey-legacy-'));
  const path = join(dir, 'legacy.sqlite');
  try {
    const db = new DatabaseSync(path);
    db.exec(`CREATE TABLE "user" (id TEXT PRIMARY KEY, name TEXT, email TEXT);
      CREATE TABLE account (id TEXT); CREATE TABLE session (id TEXT); CREATE TABLE verification (id TEXT, identifier TEXT, value TEXT);
      INSERT INTO "user" VALUES ('1', 'Admin', 'a@b.c');`);
    db.close();
    for (const args of [['--passkeys-only', '--yes'], ['--yes']]) {
      const result = run('scripts/auth-reset.mjs', path, ...args);
      assert.equal(result.status, 0, result.stderr);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
