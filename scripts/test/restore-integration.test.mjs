import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { copyFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { rootCertificates } from 'node:tls';
import { createAuth } from '../../apps/backend/src/auth.ts';
import { createVault } from '../../apps/backend/src/vault.ts';

test('restaura banco, autenticação, chave e integração em outro caminho', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'homora-restore-full-'));
  const source = join(dir, 'source.sqlite');
  const backup = join(dir, 'backup.sqlite');
  const restored = join(dir, 'restored.sqlite');
  const password = 'senha-teste-restauracao';
  const integration = {
    url: 'https://pve.example:8006',
    tokenId: 'user@pve!dashboard',
    secret: 'segredo-ficticio',
    ca: rootCertificates[0],
  };
  try {
    const db = new DatabaseSync(source);
    db.exec("CREATE TABLE services (name TEXT); INSERT INTO services VALUES ('teste');");
    db.close();
    createAuth(`${source}.auth`).setup(password);
    await createVault(source).save(integration);
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
      assert.equal(restoredDb.prepare('SELECT name FROM services').get().name, 'teste');
    } finally {
      restoredDb.close();
    }
    const auth = createAuth(`${restored}.auth`);
    assert.ok(auth.login(password, 'teste'));
    assert.deepEqual(createVault(restored).load(), integration);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
