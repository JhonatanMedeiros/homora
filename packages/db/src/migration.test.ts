import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { expect, it } from 'vitest';
import {
  createDatabase,
  services,
  serviceGroups,
  integrationInstances,
  integrationWidgets,
} from './index.js';
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
    expect((await database.db.select().from(serviceGroups)).map(({ name }) => name)).toEqual([
      'Mídia',
    ]);
    expect((await database.db.select().from(services))[0].position).toBe(0);
    expect((await database.db.select().from(services))[0].allowPrivate).toBe(false);
    database.close();
    database = createDatabase(path);
    expect(await database.db.select().from(services)).toHaveLength(1);
    database.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it('adiciona integrações e widgets ao banco anterior sem alterar serviços e preserva referências', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'homora-integration-migration-'));
  const path = join(dir, 'data.sqlite');
  try {
    const old = new DatabaseSync(path);
    old.exec(
      "CREATE TABLE services (id INTEGER PRIMARY KEY, name TEXT NOT NULL, url TEXT NOT NULL, category TEXT NOT NULL, description TEXT NOT NULL); INSERT INTO services VALUES (1, 'Aplicativo', 'http://localhost/', 'Casa', '');",
    );
    old.close();
    let database = createDatabase(path);
    const [instance] = await database.db
      .insert(integrationInstances)
      .values({ type: 'proxmox', name: 'Infraestrutura', secretRef: 'legacy-proxmox' })
      .returning();
    await database.db
      .insert(integrationWidgets)
      .values({ integrationId: instance.id, type: 'inventory', name: 'Recursos' });
    expect((await database.db.select().from(services))[0].name).toBe('Aplicativo');
    expect((await database.db.select().from(services))[0].allowPrivate).toBe(false);
    await expect(database.db.delete(integrationInstances)).rejects.toThrow();
    database.close();
    database = createDatabase(path);
    expect(await database.db.select().from(integrationInstances)).toHaveLength(1);
    expect((await database.db.select().from(integrationWidgets))[0].integrationId).toBe(
      instance.id,
    );
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

it('atualiza banco com primeira migração já registrada e mantém dados', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'homora-versioned-migration-'));
  const path = join(dir, 'data.sqlite');
  try {
    const migration = readMigrationFiles({
      migrationsFolder: fileURLToPath(new URL('../migrations', import.meta.url)),
    })[0];
    const old = new DatabaseSync(path);
    old.exec(
      'CREATE TABLE __drizzle_migrations (id INTEGER PRIMARY KEY, hash TEXT NOT NULL, created_at NUMERIC NOT NULL)',
    );
    for (const statement of migration.sql) old.exec(statement);
    old
      .prepare('INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)')
      .run(migration.hash, migration.folderMillis);
    old.exec(
      "INSERT INTO services (id, name, url, category, description) VALUES (5, 'Existente', 'http://localhost/', 'Casa', '')",
    );
    old.close();
    const db = createDatabase(path);
    expect((await db.db.select().from(services))[0].name).toBe('Existente');
    expect(await db.db.select().from(integrationInstances)).toEqual([]);
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
