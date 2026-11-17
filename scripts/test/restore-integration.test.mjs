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
const { createDatabase, getSqliteHandle } = await import('../../packages/db/src/index.ts');
const { createVault } = await import('../../apps/backend/src/vault.ts');

test('restores database (with its administrator account), key and integration to a different path', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'homora-restore-full-'));
  const source = join(dir, 'source.sqlite');
  const backup = join(dir, 'backup.sqlite');
  const restored = join(dir, 'restored.sqlite');
  const password = 'restore-test-password';
  const email = 'admin@homora.test';
  const authOptions = (db) => ({
    sqlite: getSqliteHandle(db.db),
    secret: 'restore-test-secret'.repeat(3),
    webPort: 5173,
  });
  const integration = {
    url: 'https://pve.example:8006',
    tokenId: 'user@pve!dashboard',
    secret: 'dummy-secret',
    ca: rootCertificates[0],
  };
  try {
    const db = createDatabase(source);
    const sqlite = getSqliteHandle(db.db);
    const monitor = sqlite.prepare('INSERT INTO monitors (name) VALUES (?)').run('test');
    sqlite
      .prepare('INSERT INTO services (id, url, category, description) VALUES (?, ?, ?, ?)')
      .run(Number(monitor.lastInsertRowid), 'https://service.example', 'tests', '');
    await createAuth(authOptions(db)).setup({ name: 'Administrator', email, password });
    db.close();
    await createVault(source).save(integration);
    const sourceDb = new DatabaseSync(source);
    const credentials = JSON.stringify({ secret: 'dummy-ha-secret', ca: rootCertificates[0] });
    const encrypted = createVault(source).seal(credentials, false);
    sourceDb
      .prepare(
        'INSERT INTO integration_instances (id, type, name, public_config, secret_ref, certificate_ref) VALUES (1, ?, ?, ?, ?, ?)',
      )
      .run(
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
    sourceDb
      .prepare(
        "INSERT INTO page_widgets(page_id,type,name,config,version,connection_id,position) VALUES((SELECT id FROM pages ORDER BY id LIMIT 1),'note','Runbook',?,1,NULL,0)",
      )
      .run(JSON.stringify({ text: '**Restart** safely' }));
    const quickLinks = {
      title: 'Useful',
      links: [{ label: 'Example', url: 'https://example.test' }],
    };
    sourceDb
      .prepare(
        "INSERT INTO page_widgets(page_id,type,name,config,version,connection_id,position,size) VALUES((SELECT id FROM pages ORDER BY id LIMIT 1),'quick-links','Links',?,1,NULL,1,'wide')",
      )
      .run(JSON.stringify(quickLinks));
    const maintenance = { days: 7, limit: 5, groups: ['Infra'], pages: ['Home'] };
    sourceDb
      .prepare(
        "INSERT INTO page_widgets(page_id,type,name,config,version,connection_id,position,size) VALUES((SELECT id FROM pages ORDER BY id LIMIT 1),'maintenance-schedule','Maintenance',?,1,NULL,2,'wide')",
      )
      .run(JSON.stringify(maintenance));
    sourceDb.close();
    const runBackup = (from, to) => {
      const result = spawnSync(process.execPath, ['scripts/backup.mjs', from, to], {
        encoding: 'utf8',
      });
      assert.equal(result.status, 0, result.stderr);
    };
    runBackup(source, backup);
    for (const suffix of ['.key', '.proxmox']) await copyFile(source + suffix, backup + suffix);
    runBackup(backup, restored);
    for (const suffix of ['.key', '.proxmox']) await copyFile(backup + suffix, restored + suffix);
    const restoredDb = new DatabaseSync(restored, { readOnly: true });
    try {
      assert.equal(restoredDb.prepare('SELECT name FROM service_cards').get().name, 'test');
      assert.deepEqual(
        {
          ...restoredDb
            .prepare(
              "SELECT config,version,size FROM page_widgets WHERE type='maintenance-schedule'",
            )
            .get(),
        },
        { config: JSON.stringify(maintenance), version: 1, size: 'wide' },
      );
      assert.deepEqual(
        {
          ...restoredDb
            .prepare("SELECT config, version, size FROM page_widgets WHERE type='quick-links'")
            .get(),
        },
        { config: JSON.stringify(quickLinks), version: 1, size: 'wide' },
      );
      assert.deepEqual(
        { ...restoredDb.prepare("SELECT name, config FROM page_widgets WHERE type='note'").get() },
        { name: 'Runbook', config: JSON.stringify({ text: '**Restart** safely' }) },
      );
    } finally {
      restoredDb.close();
    }
    // The account lives in the database, so restoring the database restores the sign-in.
    const restoredAuth = createDatabase(restored);
    try {
      const auth = createAuth(authOptions(restoredAuth));
      assert.ok(auth.configured());
      assert.ok(await auth.createSessionCookie(email, password));
    } finally {
      restoredAuth.close();
    }
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
