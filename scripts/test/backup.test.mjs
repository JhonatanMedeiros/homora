import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

test('backup preserves data and does not overwrite existing target', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'homora-backup-'));
  try {
    const source = join(dir, 'source.sqlite');
    const target = join(dir, 'backup.sqlite');
    const db = new DatabaseSync(source);
    db.exec("CREATE TABLE items (name TEXT); INSERT INTO items VALUES ('Jellyfin');");
    db.close();
    const run = () =>
      spawnSync(process.execPath, ['scripts/backup.mjs', source, target], { encoding: 'utf8' });
    assert.equal(run().status, 0);
    assert.notEqual(run().status, 0);
    const restored = new DatabaseSync(target, { readOnly: true });
    assert.equal(restored.prepare('SELECT name FROM items').get().name, 'Jellyfin');
    restored.close();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('backup includes changes still in WAL and allows restoring them', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'homora-backup-wal-'));
  let db;
  try {
    const source = join(dir, 'source.sqlite');
    const target = join(dir, 'backup.sqlite');
    const restoredPath = join(dir, 'restored.sqlite');
    db = new DatabaseSync(source);
    db.exec(
      "PRAGMA journal_mode=WAL; CREATE TABLE items (name TEXT); INSERT INTO items VALUES ('Jellyfin');",
    );
    const backup = spawnSync(process.execPath, ['scripts/backup.mjs', source, target], {
      encoding: 'utf8',
    });
    assert.equal(backup.status, 0, backup.stderr);
    assert.equal((await stat(target)).mode & 0o777, 0o600);
    const restore = spawnSync(process.execPath, ['scripts/backup.mjs', target, restoredPath], {
      encoding: 'utf8',
    });
    assert.equal(restore.status, 0, restore.stderr);
    const restored = new DatabaseSync(restoredPath, { readOnly: true });
    try {
      assert.equal(restored.prepare('SELECT name FROM items').get().name, 'Jellyfin');
      assert.equal(restored.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
    } finally {
      restored.close();
    }
  } finally {
    db?.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('source failure does not leave incomplete backup nor modify existing target', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'homora-backup-invalid-'));
  try {
    const source = join(dir, 'invalid.sqlite');
    const target = join(dir, 'backup.sqlite');
    await writeFile(source, 'not a SQLite database');
    const run = () =>
      spawnSync(process.execPath, ['scripts/backup.mjs', source, target], { encoding: 'utf8' });
    assert.notEqual(run().status, 0);
    await assert.rejects(stat(target), { code: 'ENOENT' });
    await writeFile(target, 'previous backup');
    assert.notEqual(run().status, 0);
    assert.equal(await readFile(target, 'utf8'), 'previous backup');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
