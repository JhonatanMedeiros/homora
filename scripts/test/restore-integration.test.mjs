import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { copyFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { rootCertificates } from 'node:tls';
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
const { createVault } = await import('../../apps/backend/src/vault.ts');

test('restores database, auth, key and integration to a different path', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'homora-restore-full-'));
  const source = join(dir, 'source.sqlite');
  const backup = join(dir, 'backup.sqlite');
  const restored = join(dir, 'restored.sqlite');
  const password = 'restore-test-password';
  const integration = {
    url: 'https://pve.example:8006',
    tokenId: 'user@pve!dashboard',
    secret: 'dummy-secret',
    ca: rootCertificates[0],
  };
  try {
    const db = new DatabaseSync(source);
    db.exec("CREATE TABLE services (name TEXT); INSERT INTO services VALUES ('test');");
    db.close();
    createAuth(`${source}.auth`).setup(password);
    await createVault(source).save(integration);
    const sourceDb = new DatabaseSync(source);
    sourceDb.exec(`CREATE TABLE integration_instances (
      id INTEGER PRIMARY KEY, type TEXT NOT NULL, name TEXT NOT NULL,
      public_config TEXT NOT NULL, secret_ref TEXT, certificate_ref TEXT
    )`);
    const credentials = JSON.stringify({ secret: 'dummy-ha-secret', ca: rootCertificates[0] });
    const encrypted = createVault(source).seal(credentials, false);
    sourceDb.prepare('INSERT INTO integration_instances VALUES (1, ?, ?, ?, ?, ?)').run(
      'home-assistant',
      'Home',
      JSON.stringify({
        url: 'https://ha.example',
        entityId: 'sensor.temperature',
        allowPrivate: true,
      }),
      encrypted,
      'both',
    );
    sourceDb.close();
    const runBackup = (from, to) => {
      const result = spawnSync(process.execPath, ['scripts/backup.mjs', from, to], {
        encoding: 'utf8',
      });
      assert.equal(result.status, 0, result.stderr);
    };
    runBackup(source, backup);
    for (const suffix of ['.auth', '.key', '.proxmox'])
      await copyFile(source + suffix, backup + suffix);
    runBackup(backup, restored);
    for (const suffix of ['.auth', '.key', '.proxmox'])
      await copyFile(backup + suffix, restored + suffix);
    const restoredDb = new DatabaseSync(restored, { readOnly: true });
    try {
      assert.equal(restoredDb.prepare('SELECT name FROM services').get().name, 'test');
    } finally {
      restoredDb.close();
    }
    const auth = createAuth(`${restored}.auth`);
    assert.ok(auth.login(password, 'test'));
    assert.deepEqual(createVault(restored).load(), integration);
    const restoredVault = createVault(restored);
    const inspectDb = new DatabaseSync(restored, { readOnly: true });
    try {
      const row = inspectDb
        .prepare('SELECT secret_ref FROM integration_instances WHERE type = ?')
        .get('home-assistant');
      assert.ok(row?.secret_ref);
      const credentials = JSON.parse(restoredVault.unseal(row.secret_ref));
      assert.equal(credentials.secret, 'dummy-ha-secret');
      assert.equal(credentials.ca, rootCertificates[0]);
    } finally {
      inspectDb.close();
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
