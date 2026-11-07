import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

test('backup preserva dados e não sobrescreve destino existente', async () => {
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

test('backup inclui alterações ainda presentes no WAL e permite restaurá-las', async () => {
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

test('falha de origem não deixa backup incompleto nem altera destino existente', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'homora-backup-invalid-'));
  try {
    const source = join(dir, 'invalid.sqlite');
    const target = join(dir, 'backup.sqlite');
    await writeFile(source, 'não é um banco SQLite');
    const run = () =>
      spawnSync(process.execPath, ['scripts/backup.mjs', source, target], { encoding: 'utf8' });
    assert.notEqual(run().status, 0);
    await assert.rejects(stat(target), { code: 'ENOENT' });
    await writeFile(target, 'backup anterior');
    assert.notEqual(run().status, 0);
    assert.equal(await readFile(target, 'utf8'), 'backup anterior');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
