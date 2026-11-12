import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { expect, it } from 'vitest';
import {
  createDatabase,
  getSqliteHandle,
  services,
  serviceGroups,
  integrationInstances,
  integrationWidgets,
} from './index.js';
it('adopts legacy database and preserves its data across restarts', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'homora-migration-')),
    path = join(dir, 'data.sqlite');
  try {
    const old = new DatabaseSync(path);
    old.exec(
      "CREATE TABLE services (id INTEGER PRIMARY KEY, name TEXT NOT NULL, url TEXT NOT NULL, category TEXT NOT NULL, description TEXT NOT NULL); INSERT INTO services VALUES (1, 'Jellyfin', 'http://localhost/', 'Media', '');",
    );
    old.close();
    let database = createDatabase(path);
    expect((await database.db.select().from(services))[0].name).toBe('Jellyfin');
    expect((await database.db.select().from(serviceGroups)).map(({ name }) => name)).toEqual([
      'Media',
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

it('adds integrations and widgets to legacy database without altering services and preserves references', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'homora-integration-migration-'));
  const path = join(dir, 'data.sqlite');
  try {
    const old = new DatabaseSync(path);
    old.exec(
      "CREATE TABLE services (id INTEGER PRIMARY KEY, name TEXT NOT NULL, url TEXT NOT NULL, category TEXT NOT NULL, description TEXT NOT NULL); INSERT INTO services VALUES (1, 'App', 'http://localhost/', 'Home', '');",
    );
    old.close();
    let database = createDatabase(path);
    const [instance] = await database.db
      .insert(integrationInstances)
      .values({ type: 'proxmox', name: 'Infrastructure', secretRef: 'legacy-proxmox' })
      .returning();
    await database.db
      .insert(integrationWidgets)
      .values({ integrationId: instance.id, type: 'inventory', name: 'Resources' });
    expect((await database.db.select().from(services))[0].name).toBe('App');
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
it('rejects incompatible previous schema without erasing it', () => {
  const dir = mkdtempSync(join(tmpdir(), 'homora-migration-')),
    path = join(dir, 'data.sqlite');
  try {
    const old = new DatabaseSync(path);
    old.exec('CREATE TABLE services (id INTEGER PRIMARY KEY, custom TEXT)');
    old.close();
    expect(() => createDatabase(path)).toThrow('Incompatible');
    const check = new DatabaseSync(path);
    expect(check.prepare('PRAGMA table_info(services)').all()).toHaveLength(2);
    check.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it('upgrades database with first migration already registered and preserves data', async () => {
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
      "INSERT INTO services (id, name, url, category, description) VALUES (5, 'Existing', 'http://localhost/', 'Home', '')",
    );
    old.close();
    const db = createDatabase(path);
    expect((await db.db.select().from(services))[0].name).toBe('Existing');
    expect(await db.db.select().from(integrationInstances)).toEqual([]);
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it('adiciona histórico e lotes preservando dados da versão anterior', () => {
  const dir = mkdtempSync(join(tmpdir(), 'homora-observation-migration-'));
  const path = join(dir, 'data.sqlite');
  try {
    const migrations = readMigrationFiles({
      migrationsFolder: fileURLToPath(new URL('../migrations', import.meta.url)),
    });
    const old = new DatabaseSync(path);
    old.exec(
      'CREATE TABLE __drizzle_migrations (id INTEGER PRIMARY KEY, hash TEXT NOT NULL, created_at NUMERIC NOT NULL)',
    );
    for (const migration of migrations.slice(0, 13)) {
      for (const statement of migration.sql) old.exec(statement);
      old
        .prepare('INSERT INTO __drizzle_migrations(hash,created_at) VALUES(?,?)')
        .run(migration.hash, migration.folderMillis);
    }
    old.exec(
      "INSERT INTO services(id,name,url,category,description) VALUES(5,'Existing','https://example.test','Home',''); INSERT INTO integration_instances(id,type,name,public_config,secret_ref) VALUES(7,'jellyfin','Media','{}','encrypted'); INSERT INTO service_observations VALUES(5,'signature','{}'); INSERT INTO service_proposals(id,author_id,diff,base_hash,base_version,expires_at,state,created_at) VALUES('old','author','{}','hash',1,123,'pending',1);",
    );
    old.close();
    const database = createDatabase(path);
    database.close();
    const check = new DatabaseSync(path);
    expect(
      check.prepare('SELECT name, expected_status, check_path FROM services WHERE id=5').get(),
    ).toEqual({
      name: 'Existing',
      expected_status: null,
      check_path: null,
    });
    expect(check.prepare('SELECT secret_ref FROM integration_instances WHERE id=7').get()).toEqual({
      secret_ref: 'encrypted',
    });
    expect(check.prepare('SELECT * FROM service_observations').all()).toHaveLength(1);
    expect(check.prepare('SELECT batch_id FROM service_proposals WHERE id=?').get('old')).toEqual({
      batch_id: null,
    });
    expect(check.prepare('SELECT * FROM service_observation_history').all()).toEqual([]);
    expect(() =>
      check.prepare('UPDATE service_proposals SET batch_id=? WHERE id=?').run('changed', 'old'),
    ).toThrow();
    check.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it('exposes status and latency of existing history rows through virtual columns', () => {
  const dir = mkdtempSync(join(tmpdir(), 'homora-uptime-')),
    path = join(dir, 'data.sqlite');
  try {
    const database = createDatabase(path);
    const sqlite = getSqliteHandle(database.db);
    sqlite.exec(
      "INSERT INTO services(id,name,url,category,description) VALUES(1,'S','http://x/','C','');",
    );
    sqlite
      .prepare(
        'INSERT INTO service_observation_history(service_id,signature,observed_at,observation) VALUES(1,?,?,?)',
      )
      .run('sig', 1, JSON.stringify({ status: 'available', latencyMs: 12.5 }));
    expect(
      sqlite.prepare('SELECT status,latency_ms AS latency FROM service_observation_history').all(),
    ).toEqual([{ status: 'available', latency: 12.5 }]);
    database.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it('adds push sources while preserving existing services and defaulting to no sources', () => {
  const dir = mkdtempSync(join(tmpdir(), 'homora-push-migration-'));
  const path = join(dir, 'data.sqlite');
  try {
    const migrations = readMigrationFiles({
      migrationsFolder: fileURLToPath(new URL('../migrations', import.meta.url)),
    });
    const old = new DatabaseSync(path);
    old.exec(
      'CREATE TABLE __drizzle_migrations (id INTEGER PRIMARY KEY, hash TEXT NOT NULL, created_at NUMERIC NOT NULL)',
    );
    for (const migration of migrations.slice(0, 17)) {
      for (const statement of migration.sql) old.exec(statement);
      old
        .prepare('INSERT INTO __drizzle_migrations(hash,created_at) VALUES(?,?)')
        .run(migration.hash, migration.folderMillis);
    }
    old.exec(
      "INSERT INTO services(id,name,url,category,description,is_public,expected_status,check_path) VALUES(5,'Existing','https://example.test','Home','',1,'2xx','/health'); INSERT INTO app_settings(key,value) VALUES('public_status_enabled','true')",
    );
    old.close();
    const database = createDatabase(path);
    database.close();
    const check = new DatabaseSync(path);
    expect(
      check
        .prepare('SELECT name,is_public,expected_status,check_path FROM services WHERE id=5')
        .get(),
    ).toEqual({ name: 'Existing', is_public: 1, expected_status: '2xx', check_path: '/health' });
    expect(
      check.prepare("SELECT value FROM app_settings WHERE key='public_status_enabled'").get(),
    ).toEqual({ value: 'true' });
    expect(check.prepare('SELECT * FROM docker_push_sources').all()).toEqual([]);
    check.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it('upgrades the Docker push schema to notifications without changing existing data', () => {
  const dir = mkdtempSync(join(tmpdir(), 'homora-notification-migration-'));
  const path = join(dir, 'data.sqlite');
  try {
    const migrations = readMigrationFiles({
      migrationsFolder: fileURLToPath(new URL('../migrations', import.meta.url)),
    });
    const old = new DatabaseSync(path);
    old.exec(
      'CREATE TABLE __drizzle_migrations (id INTEGER PRIMARY KEY, hash TEXT NOT NULL, created_at NUMERIC NOT NULL)',
    );
    for (const migration of migrations.slice(0, 18)) {
      for (const statement of migration.sql) old.exec(statement);
      old
        .prepare('INSERT INTO __drizzle_migrations(hash,created_at) VALUES(?,?)')
        .run(migration.hash, migration.folderMillis);
    }
    old.exec(
      "INSERT INTO services(id,name,url,category,description) VALUES(1,'Existing','https://example.test','Home',''); INSERT INTO docker_push_sources(id,name,token_hash,created_at,inventory_version) VALUES('source','Docker','test-hash',1,3);",
    );
    old.close();
    const database = createDatabase(path);
    const db = getSqliteHandle(database.db);
    expect(db.prepare('SELECT name,inventory_version FROM docker_push_sources').get()).toEqual({
      name: 'Docker',
      inventory_version: 3,
    });
    expect(db.prepare('SELECT name FROM services WHERE id=1').get()).toEqual({ name: 'Existing' });
    expect(db.prepare('SELECT * FROM notification_channels').all()).toEqual([]);
    expect(db.prepare('SELECT * FROM notification_states').all()).toEqual([]);
    database.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
