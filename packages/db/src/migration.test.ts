import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { createDatabase, services } from './index.js';
it('adota o banco anterior e preserva seus dados em reinicializações', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'homora-migration-')),
    path = join(dir, 'data.sqlite');
  try {
    const old = new DatabaseSync(path);
    old.exec(
      "CREATE TABLE services (id INTEGER PRIMARY KEY, name TEXT NOT NULL, url TEXT NOT NULL, category TEXT NOT NULL, description TEXT NOT NULL); INSERT INTO services VALUES (1, 'Jellyfin', 'http://localhost/', 'Mídia', '');",
    );
    old.close();
    let database = createDatabase(path);
    expect((await database.db.select().from(services))[0].name).toBe('Jellyfin');
    database.close();
    database = createDatabase(path);
    expect(await database.db.select().from(services)).toHaveLength(1);
    database.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
it('rejeita esquema anterior incompatível sem apagá-lo', () => {
  const dir = mkdtempSync(join(tmpdir(), 'homora-migration-')),
    path = join(dir, 'data.sqlite');
  try {
    const old = new DatabaseSync(path);
    old.exec('CREATE TABLE services (id INTEGER PRIMARY KEY, custom TEXT)');
    old.close();
    expect(() => createDatabase(path)).toThrow('incompatível');
    const check = new DatabaseSync(path);
    expect(check.prepare('PRAGMA table_info(services)').all()).toHaveLength(2);
    check.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
