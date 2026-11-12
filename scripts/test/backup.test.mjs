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

test('backup takes the background image along and a restore round trip keeps it', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'homora-backup-image-'));
  try {
    const source = join(dir, 'source.sqlite');
    const target = join(dir, 'backup.sqlite');
    const restoredPath = join(dir, 'restored.sqlite');
    const db = new DatabaseSync(source);
    db.exec("CREATE TABLE items (name TEXT); INSERT INTO items VALUES ('Jellyfin');");
    db.close();
    const picture = Buffer.from('processed-picture-bytes');
    await writeFile(`${source}.background`, picture);
    const run = (from, to) =>
      spawnSync(process.execPath, ['scripts/backup.mjs', from, to], { encoding: 'utf8' });
    assert.equal(run(source, target).status, 0);
    assert.deepEqual(await readFile(`${target}.background`), picture);
    assert.equal((await stat(`${target}.background`)).mode & 0o777, 0o600);
    assert.equal(run(target, restoredPath).status, 0);
    assert.deepEqual(await readFile(`${restoredPath}.background`), picture);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('a database without a picture makes a backup without one', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'homora-backup-noimage-'));
  try {
    const source = join(dir, 'source.sqlite');
    const target = join(dir, 'backup.sqlite');
    new DatabaseSync(source).close();
    const result = spawnSync(process.execPath, ['scripts/backup.mjs', source, target], {
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    await assert.rejects(stat(`${target}.background`), { code: 'ENOENT' });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('an existing picture next to the target is never overwritten or deleted', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'homora-backup-keep-'));
  try {
    const source = join(dir, 'source.sqlite');
    const target = join(dir, 'backup.sqlite');
    new DatabaseSync(source).close();
    await writeFile(`${source}.background`, 'new');
    await writeFile(`${target}.background`, 'previous');
    const result = spawnSync(process.execPath, ['scripts/backup.mjs', source, target], {
      encoding: 'utf8',
    });
    assert.notEqual(result.status, 0);
    assert.equal(await readFile(`${target}.background`, 'utf8'), 'previous');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
