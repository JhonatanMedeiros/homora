import { DatabaseSync } from 'node:sqlite';
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
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

const MIGRATIONS = readMigrationFiles({
  migrationsFolder: fileURLToPath(new URL('../migrations', import.meta.url)),
});
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
    expect((await database.db.select().from(services))[0].alias).toBeNull();
    expect((await database.db.select().from(services))[0].checkUrl).toBeNull();
    expect((await database.db.select().from(serviceGroups)).map(({ name }) => name)).toEqual([
      'Media',
    ]);
    expect((await database.db.select().from(services))[0].position).toBe(0);
    expect((await database.db.select().from(services))[0].allowPrivate).toBe(false);
    expect((await database.db.select().from(services))[0].openTarget).toBe('new-tab');
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
    const migration = MIGRATIONS[0];
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
    const migrations = MIGRATIONS;
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
    const migrations = MIGRATIONS;
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
    const migrations = MIGRATIONS;
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

it('shortens stored signatures to 16 characters and keeps rows matching', () => {
  const dir = mkdtempSync(join(tmpdir(), 'homora-signature-migration-'));
  const path = join(dir, 'data.sqlite');
  const long = 'a1b2c3d4e5f60718'.repeat(4);
  const short = long.slice(0, 16);
  try {
    const migrations = MIGRATIONS;
    const old = new DatabaseSync(path);
    old.exec(
      'CREATE TABLE __drizzle_migrations (id INTEGER PRIMARY KEY, hash TEXT NOT NULL, created_at NUMERIC NOT NULL)',
    );
    for (const migration of migrations.slice(0, 19)) {
      for (const statement of migration.sql) old.exec(statement);
      old
        .prepare('INSERT INTO __drizzle_migrations(hash,created_at) VALUES(?,?)')
        .run(migration.hash, migration.folderMillis);
    }
    old.exec(
      "INSERT INTO services(id,name,url,category,description) VALUES(1,'S','http://x/','C','');",
    );
    const state = (signature: string) =>
      JSON.stringify({
        signature,
        attempt: 'a',
        status: 'unknown',
        lastDown: null,
        notifiedDown: false,
      });
    const history = old.prepare(
      'INSERT INTO service_observation_history(service_id,signature,observed_at,observation) VALUES(1,?,?,?)',
    );
    history.run(long, 1, JSON.stringify({ status: 'available', latencyMs: 5 }));
    history.run(short, 2, JSON.stringify({ status: 'unavailable' })); // already short: idempotent
    old
      .prepare('INSERT INTO service_observations(service_id,signature,observation) VALUES(1,?,?)')
      .run(long, '{}');
    old.prepare('INSERT INTO notification_states(service_id,state) VALUES(1,?)').run(state(long));
    old.close();
    const database = createDatabase(path);
    database.close();
    const check = new DatabaseSync(path);
    expect(
      check
        .prepare('SELECT signature,status FROM service_observation_history ORDER BY observed_at')
        .all(),
    ).toEqual([
      { signature: short, status: 'available' },
      { signature: short, status: 'unavailable' },
    ]);
    expect(check.prepare('SELECT signature FROM service_observations').get()).toEqual({
      signature: short,
    });
    expect(
      JSON.parse(
        (check.prepare('SELECT state FROM notification_states').get() as { state: string }).state,
      ),
    ).toMatchObject({ signature: short, status: 'unknown' });
    check.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it('adds the optional card-to-guest link without changing existing cards and unlinks on connection delete', () => {
  const dir = mkdtempSync(join(tmpdir(), 'homora-host-link-migration-'));
  const path = join(dir, 'data.sqlite');
  try {
    const migrations = MIGRATIONS;
    const old = new DatabaseSync(path);
    old.exec(
      'CREATE TABLE __drizzle_migrations (id INTEGER PRIMARY KEY, hash TEXT NOT NULL, created_at NUMERIC NOT NULL)',
    );
    // Database created by the previous version: every migration except the last one.
    for (const migration of migrations.slice(0, 20)) {
      for (const statement of migration.sql) old.exec(statement);
      old
        .prepare('INSERT INTO __drizzle_migrations(hash,created_at) VALUES(?,?)')
        .run(migration.hash, migration.folderMillis);
    }
    old.exec(
      "INSERT INTO services(id,name,url,category,description) VALUES(7,'Existing','https://example.test','Home','')",
    );
    old.close();
    createDatabase(path).close();
    const check = new DatabaseSync(path);
    check.exec('PRAGMA foreign_keys = ON');
    expect(
      check
        .prepare(
          'SELECT name,host_connection_id,host_node,host_vmid,host_type FROM services WHERE id=7',
        )
        .get(),
    ).toEqual({
      name: 'Existing',
      host_connection_id: null,
      host_node: null,
      host_vmid: null,
      host_type: null,
    });
    check.exec(
      "INSERT INTO integration_instances(id,type,name) VALUES(3,'proxmox','PVE'); UPDATE services SET host_connection_id=3,host_node='pve1',host_vmid=100,host_type='lxc' WHERE id=7; DELETE FROM integration_instances WHERE id=3",
    );
    expect(
      check.prepare('SELECT host_connection_id,host_node FROM services WHERE id=7').get(),
    ).toEqual({ host_connection_id: null, host_node: 'pve1' });
    check.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it('adds suggestion dismissals on top of the host link without touching existing cards', () => {
  const dir = mkdtempSync(join(tmpdir(), 'homora-dismissal-migration-'));
  const path = join(dir, 'data.sqlite');
  try {
    const migrations = MIGRATIONS;
    const old = new DatabaseSync(path);
    old.exec(
      'CREATE TABLE __drizzle_migrations (id INTEGER PRIMARY KEY, hash TEXT NOT NULL, created_at NUMERIC NOT NULL)',
    );
    // A database created by the previous version (without the dismissals table).
    for (const migration of migrations.slice(0, 21)) {
      for (const statement of migration.sql) old.exec(statement);
      old
        .prepare('INSERT INTO __drizzle_migrations(hash,created_at) VALUES(?,?)')
        .run(migration.hash, migration.folderMillis);
    }
    old.exec(
      "INSERT INTO services(id,name,url,category,description,host_connection_id,host_node,host_vmid,host_type) VALUES(7,'Existing','https://example.test','Home','',NULL,'pve1',101,'lxc')",
    );
    old.close();
    createDatabase(path).close();
    const check = new DatabaseSync(path);
    check.exec('PRAGMA foreign_keys = ON');
    expect(check.prepare('SELECT name,host_node FROM services WHERE id=7').get()).toEqual({
      name: 'Existing',
      host_node: 'pve1',
    });
    check.exec(
      "INSERT INTO integration_instances(id,type,name) VALUES(3,'proxmox','PVE'); INSERT INTO host_suggestion_dismissals VALUES(7,3,'pve1',101,'lxc',1)",
    );
    expect(() =>
      check.exec("INSERT INTO host_suggestion_dismissals VALUES(7,3,'pve1',101,'lxc',2)"),
    ).toThrow();
    check.exec('DELETE FROM services WHERE id=7');
    expect(check.prepare('SELECT * FROM host_suggestion_dismissals').all()).toEqual([]);
    check.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it('adds service dependencies on top of the previous schema, rejecting self links and cascading', () => {
  const dir = mkdtempSync(join(tmpdir(), 'homora-dependency-migration-'));
  const path = join(dir, 'data.sqlite');
  try {
    const migrations = MIGRATIONS;
    const old = new DatabaseSync(path);
    old.exec(
      'CREATE TABLE __drizzle_migrations (id INTEGER PRIMARY KEY, hash TEXT NOT NULL, created_at NUMERIC NOT NULL)',
    );
    // A database created by the previous version (without the dependencies table).
    for (const migration of migrations.slice(0, 22)) {
      for (const statement of migration.sql) old.exec(statement);
      old
        .prepare('INSERT INTO __drizzle_migrations(hash,created_at) VALUES(?,?)')
        .run(migration.hash, migration.folderMillis);
    }
    old.exec(
      "INSERT INTO services(id,name,url,category,description) VALUES(1,'A','https://a.test','Home',''),(2,'B','https://b.test','Home','')",
    );
    old.close();
    createDatabase(path).close();
    const check = new DatabaseSync(path);
    check.exec('PRAGMA foreign_keys = ON');
    expect(check.prepare('SELECT name FROM services ORDER BY id').all()).toEqual([
      { name: 'A' },
      { name: 'B' },
    ]);
    check.exec('INSERT INTO service_dependencies VALUES(1,2,1)');
    expect(() => check.exec('INSERT INTO service_dependencies VALUES(1,2,2)')).toThrow();
    expect(() => check.exec('INSERT INTO service_dependencies VALUES(1,1,2)')).toThrow();
    check.exec('DELETE FROM services WHERE id=2');
    expect(check.prepare('SELECT * FROM service_dependencies').all()).toEqual([]);
    check.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it('adds pages with a default Home that holds every existing group, and keeps names unique', () => {
  const dir = mkdtempSync(join(tmpdir(), 'homora-pages-migration-'));
  const path = join(dir, 'data.sqlite');
  try {
    const migrations = MIGRATIONS;
    const old = new DatabaseSync(path);
    old.exec(
      'CREATE TABLE __drizzle_migrations (id INTEGER PRIMARY KEY, hash TEXT NOT NULL, created_at NUMERIC NOT NULL)',
    );
    // A database created by the previous version (before pages).
    for (const migration of migrations.slice(
      0,
      migrations.findIndex((migration) => migration.sql.join('').includes('CREATE TABLE `pages`')),
    )) {
      for (const statement of migration.sql) old.exec(statement);
      old
        .prepare('INSERT INTO __drizzle_migrations(hash,created_at) VALUES(?,?)')
        .run(migration.hash, migration.folderMillis);
    }
    old.exec(
      "INSERT INTO service_groups(id,name,position,columns) VALUES(1,'Media',0,3),(2,'Tools',1,NULL); INSERT INTO services(id,name,url,category,description) VALUES(1,'A','https://a.test','Media','')",
    );
    old.close();
    createDatabase(path).close();
    const check = new DatabaseSync(path);
    check.exec('PRAGMA foreign_keys = ON');
    expect(check.prepare('SELECT id,name,position FROM pages').all()).toEqual([
      { id: 1, name: 'Home', position: 0 },
    ]);
    expect(
      check.prepare('SELECT name,position,columns,page_id FROM service_groups ORDER BY id').all(),
    ).toEqual([
      { name: 'Media', position: 0, columns: 3, page_id: 1 },
      { name: 'Tools', position: 1, columns: null, page_id: 1 },
    ]);
    expect(check.prepare('SELECT name,category FROM services').all()).toEqual([
      { name: 'A', category: 'Media' },
    ]);
    expect(() => check.exec("INSERT INTO pages(name,position) VALUES('HOME',1)")).toThrow();
    expect(() => check.exec('DELETE FROM pages WHERE id=1')).toThrow();
    check.exec("INSERT INTO pages(name,position) VALUES('Lab',1)");
    // Opening it again changes nothing.
    check.close();
    createDatabase(path).close();
    const again = new DatabaseSync(path);
    expect(again.prepare('SELECT COUNT(*) AS n FROM pages').get()).toEqual({ n: 2 });
    again.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it('adds resource links without touching existing cards, connections or widgets, and cascades', () => {
  const dir = mkdtempSync(join(tmpdir(), 'homora-links-migration-'));
  const path = join(dir, 'data.sqlite');
  try {
    const migrations = MIGRATIONS;
    const old = new DatabaseSync(path);
    old.exec(
      'CREATE TABLE __drizzle_migrations (id INTEGER PRIMARY KEY, hash TEXT NOT NULL, created_at NUMERIC NOT NULL)',
    );
    // A database created by the previous version (before resource links), with data.
    const first = migrations.findIndex((migration) =>
      migration.sql.join('').includes('integration_resource_links'),
    );
    for (const migration of migrations.slice(0, first)) {
      for (const statement of migration.sql) old.exec(statement);
      old
        .prepare('INSERT INTO __drizzle_migrations(hash,created_at) VALUES(?,?)')
        .run(migration.hash, migration.folderMillis);
    }
    old.exec(
      `INSERT INTO service_groups(id,name,position) VALUES(1,'Apps',0);
       INSERT INTO services(id,name,url,category,description) VALUES(1,'A','https://a.test','Apps',''),(2,'B','https://b.test','Apps','');
       INSERT INTO integration_instances(id,type,name,public_config,secret_ref,certificate_ref) VALUES(1,'proxmox','PVE','{"url":"https://pve.test"}','sealed','secret');
       INSERT INTO integration_widgets(id,integration_id,type,name,public_config,service_id) VALUES(1,1,'proxmox','W','{}',1)`,
    );
    old.close();
    createDatabase(path).close();
    const check = new DatabaseSync(path);
    check.exec('PRAGMA foreign_keys = ON');
    expect(check.prepare('SELECT name FROM services ORDER BY id').all()).toEqual([
      { name: 'A' },
      { name: 'B' },
    ]);
    expect(check.prepare('SELECT type,secret_ref FROM integration_instances').all()).toEqual([
      { type: 'proxmox', secret_ref: 'sealed' },
    ]);
    expect(check.prepare('SELECT name,service_id FROM integration_widgets').all()).toEqual([
      { name: 'W', service_id: 1 },
    ]);
    expect(check.prepare('SELECT COUNT(*) AS n FROM integration_resource_links').get()).toEqual({
      n: 0,
    });
    // One link per card; it goes away with the card or the connection.
    check.exec("INSERT INTO integration_instances(id,type,name) VALUES(2,'coolify','C')");
    const insert = check.prepare(
      "INSERT INTO integration_resource_links(service_id,integration_id,resource_uuid,resource_type,seen_name,seen_url,created_at) VALUES(?,2,?,'application','n',NULL,1)",
    );
    insert.run(1, 'u1');
    insert.run(2, 'u2');
    expect(() => insert.run(1, 'u3')).toThrow();
    check.exec('DELETE FROM services WHERE id=1');
    expect(check.prepare('SELECT service_id FROM integration_resource_links').all()).toEqual([
      { service_id: 2 },
    ]);
    check.exec('DELETE FROM integration_instances WHERE id=2');
    expect(check.prepare('SELECT COUNT(*) AS n FROM integration_resource_links').get()).toEqual({
      n: 0,
    });
    expect(check.prepare('SELECT COUNT(*) AS n FROM services').get()).toEqual({ n: 1 });
    check.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it('preserves notification channels when adding their language', () => {
  const dir = mkdtempSync(join(tmpdir(), 'homora-notification-locale-'));
  const path = join(dir, 'data.sqlite');
  try {
    const old = new DatabaseSync(path);
    old.exec(
      'CREATE TABLE __drizzle_migrations (id INTEGER PRIMARY KEY, hash TEXT NOT NULL, created_at NUMERIC NOT NULL)',
    );
    for (const migration of MIGRATIONS.slice(0, 30)) {
      for (const statement of migration.sql) old.exec(statement);
      old
        .prepare('INSERT INTO __drizzle_migrations(hash,created_at) VALUES(?,?)')
        .run(migration.hash, migration.folderMillis);
    }
    old.exec(
      "INSERT INTO notification_channels(name,type,secret,enabled,allow_private,include_url,created_at) VALUES('Existing','discord','encrypted',1,0,0,'2026-01-01')",
    );
    old.close();
    const database = createDatabase(path);
    expect(
      getSqliteHandle(database.db)
        .prepare('SELECT name, secret, locale FROM notification_channels')
        .get(),
    ).toEqual({ name: 'Existing', secret: 'encrypted', locale: 'en' });
    database.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it('adds two-factor storage without touching the existing account and keeps it off by default', () => {
  const dir = mkdtempSync(join(tmpdir(), 'homora-two-factor-'));
  const path = join(dir, 'data.sqlite');
  try {
    const old = new DatabaseSync(path);
    old.exec(
      'CREATE TABLE __drizzle_migrations (id INTEGER PRIMARY KEY, hash TEXT NOT NULL, created_at NUMERIC NOT NULL)',
    );
    for (const migration of MIGRATIONS.slice(0, 31)) {
      for (const statement of migration.sql) old.exec(statement);
      old
        .prepare('INSERT INTO __drizzle_migrations(hash,created_at) VALUES(?,?)')
        .run(migration.hash, migration.folderMillis);
    }
    old.exec(
      "INSERT INTO \"user\"(id,name,email,emailVerified,createdAt,updatedAt) VALUES('u1','Admin','admin@homora.test',0,'2026-01-01','2026-01-01');" +
        "INSERT INTO account(id,accountId,providerId,userId,password,createdAt,updatedAt) VALUES('a1','u1','credential','u1','hash','2026-01-01','2026-01-01');" +
        "INSERT INTO session(id,expiresAt,token,createdAt,updatedAt,userId) VALUES('s1','2099-01-01','token','2026-01-01','2026-01-01','u1')",
    );
    old.close();
    const database = createDatabase(path);
    const sqlite = getSqliteHandle(database.db);
    expect(sqlite.prepare('SELECT id, email, twoFactorEnabled FROM "user"').get()).toEqual({
      id: 'u1',
      email: 'admin@homora.test',
      twoFactorEnabled: 0,
    });
    expect(sqlite.prepare('SELECT password FROM account').get()).toEqual({ password: 'hash' });
    expect(sqlite.prepare('SELECT token FROM session').get()).toEqual({ token: 'token' });
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM "twoFactor"').get()).toEqual({ n: 0 });
    // The authenticator data follows the account when it is removed.
    sqlite.exec('PRAGMA foreign_keys = ON');
    sqlite.exec(
      "INSERT INTO \"twoFactor\"(id,secret,backupCodes,userId) VALUES('t1','s','c','u1'); DELETE FROM \"user\"",
    );
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM "twoFactor"').get()).toEqual({ n: 0 });
    database.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it('adds passkey storage without touching the existing account and removes it with the account', () => {
  const dir = mkdtempSync(join(tmpdir(), 'homora-passkey-'));
  const path = join(dir, 'data.sqlite');
  try {
    const old = new DatabaseSync(path);
    old.exec(
      'CREATE TABLE __drizzle_migrations (id INTEGER PRIMARY KEY, hash TEXT NOT NULL, created_at NUMERIC NOT NULL)',
    );
    for (const migration of MIGRATIONS.slice(0, 32)) {
      for (const statement of migration.sql) old.exec(statement);
      old
        .prepare('INSERT INTO __drizzle_migrations(hash,created_at) VALUES(?,?)')
        .run(migration.hash, migration.folderMillis);
    }
    old.exec(
      "INSERT INTO \"user\"(id,name,email,emailVerified,createdAt,updatedAt) VALUES('u1','Admin','admin@homora.test',0,'2026-01-01','2026-01-01');" +
        "INSERT INTO account(id,accountId,providerId,userId,password,createdAt,updatedAt) VALUES('a1','u1','credential','u1','hash','2026-01-01','2026-01-01')",
    );
    old.close();
    const database = createDatabase(path);
    const sqlite = getSqliteHandle(database.db);
    expect(sqlite.prepare('SELECT email FROM "user"').get()).toEqual({
      email: 'admin@homora.test',
    });
    expect(sqlite.prepare('SELECT password FROM account').get()).toEqual({ password: 'hash' });
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM passkey').get()).toEqual({ n: 0 });
    // Credentials follow the account when it is removed: no orphan rows.
    sqlite.exec('PRAGMA foreign_keys = ON');
    sqlite.exec(
      "INSERT INTO passkey(id,publicKey,userId,credentialID,counter,deviceType,backedUp) VALUES('p1','k','u1','c',0,'multiDevice',1); DELETE FROM \"user\"",
    );
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM passkey').get()).toEqual({ n: 0 });
    database.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it('adds page widget storage without changing unlinked or card integration widgets across restart', () => {
  const dir = mkdtempSync(join(tmpdir(), 'homora-page-widget-migration-'));
  const path = join(dir, 'data.sqlite');
  try {
    const old = new DatabaseSync(path);
    old.exec(
      'CREATE TABLE __drizzle_migrations (id INTEGER PRIMARY KEY, hash TEXT NOT NULL, created_at NUMERIC NOT NULL)',
    );
    const first = MIGRATIONS.findIndex((migration) =>
      migration.sql.join('').includes('CREATE TABLE `page_widgets`'),
    );
    expect(first).toBeGreaterThan(0);
    for (const migration of MIGRATIONS.slice(0, first)) {
      for (const statement of migration.sql) old.exec(statement);
      old
        .prepare('INSERT INTO __drizzle_migrations(hash,created_at) VALUES(?,?)')
        .run(migration.hash, migration.folderMillis);
    }
    old.exec(`INSERT INTO service_groups(id,name,position) VALUES(1,'Apps',0);
      INSERT INTO services(id,name,url,category,description) VALUES(1,'A','https://a.test','Apps','');
      INSERT INTO integration_instances(id,type,name) VALUES(1,'proxmox','Lab');
      INSERT INTO integration_widgets(id,integration_id,type,name,public_config,service_id) VALUES(4,1,'proxmox','Card','{}',1),(5,1,'proxmox','Unlinked','{}',NULL);
      INSERT INTO service_proposals(id,author_id,diff,base_hash,expires_at,state,created_at,base_version) VALUES('proposal','agent','{}','fingerprint',9999999999,'pending',1,2);`);
    old.close();
    createDatabase(path).close();
    createDatabase(path).close();
    const check = new DatabaseSync(path);
    expect(
      check.prepare('SELECT id,name,service_id FROM integration_widgets ORDER BY id').all(),
    ).toEqual([
      { id: 4, name: 'Card', service_id: 1 },
      { id: 5, name: 'Unlinked', service_id: null },
    ]);
    expect(check.prepare('SELECT COUNT(*) AS n FROM page_widgets').get()).toEqual({ n: 0 });
    expect(
      check
        .prepare("SELECT state,base_hash,base_version FROM service_proposals WHERE id='proposal'")
        .get(),
    ).toEqual({ state: 'pending', base_hash: 'fingerprint', base_version: 2 });
    check.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it('rolls back a failed page widget migration and can migrate a restored backup', () => {
  const dir = mkdtempSync(join(tmpdir(), 'homora-page-widget-recovery-'));
  const path = join(dir, 'data.sqlite');
  const backup = join(dir, 'backup.sqlite');
  const restored = join(dir, 'restored.sqlite');
  try {
    const old = new DatabaseSync(path);
    old.exec(
      'CREATE TABLE __drizzle_migrations (id INTEGER PRIMARY KEY, hash TEXT NOT NULL, created_at NUMERIC NOT NULL)',
    );
    const first = MIGRATIONS.findIndex((migration) =>
      migration.sql.join('').includes('CREATE TABLE `page_widgets`'),
    );
    for (const migration of MIGRATIONS.slice(0, first)) {
      for (const statement of migration.sql) old.exec(statement);
      old
        .prepare('INSERT INTO __drizzle_migrations(hash,created_at) VALUES(?,?)')
        .run(migration.hash, migration.folderMillis);
    }
    old.exec(
      "INSERT INTO integration_instances(id,type,name) VALUES(1,'proxmox','Lab'); INSERT INTO integration_widgets(id,integration_id,type,name,public_config,service_id) VALUES(5,1,'proxmox','Unlinked','{}',NULL)",
    );
    old.close();
    copyFileSync(path, backup);
    const broken = new DatabaseSync(path);
    broken.exec('CREATE TABLE page_widgets (existing TEXT)');
    broken.close();
    expect(() => createDatabase(path)).toThrow();
    const check = new DatabaseSync(path);
    expect(check.prepare('SELECT name,service_id FROM integration_widgets').all()).toEqual([
      { name: 'Unlinked', service_id: null },
    ]);
    expect(check.prepare('SELECT COUNT(*) AS n FROM __drizzle_migrations').get()).toEqual({
      n: first,
    });
    check.close();
    copyFileSync(backup, restored);
    createDatabase(restored).close();
    const recovered = new DatabaseSync(restored);
    expect(recovered.prepare('SELECT name,service_id FROM integration_widgets').all()).toEqual([
      { name: 'Unlinked', service_id: null },
    ]);
    expect(recovered.prepare('SELECT COUNT(*) AS n FROM page_widgets').get()).toEqual({ n: 0 });
    recovered.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it('adds extra addresses and link types without touching cards; deleting cascades and unsets the type', () => {
  const dir = mkdtempSync(join(tmpdir(), 'homora-links-migration-'));
  const path = join(dir, 'data.sqlite');
  try {
    const old = new DatabaseSync(path);
    old.exec(
      'CREATE TABLE __drizzle_migrations (id INTEGER PRIMARY KEY, hash TEXT NOT NULL, created_at NUMERIC NOT NULL)',
    );
    // Database created before the extra-address migration.
    for (const migration of MIGRATIONS.slice(0, -3)) {
      for (const statement of migration.sql) old.exec(statement);
      old
        .prepare('INSERT INTO __drizzle_migrations(hash,created_at) VALUES(?,?)')
        .run(migration.hash, migration.folderMillis);
    }
    old.exec(
      "INSERT INTO services(id,name,url,category,description) VALUES(7,'Existing','https://example.test','Home','')",
    );
    old.close();
    createDatabase(path).close();
    const check = new DatabaseSync(path);
    check.exec('PRAGMA foreign_keys = ON');
    expect(check.prepare('SELECT name,url FROM services WHERE id=7').get()).toEqual({
      name: 'Existing',
      url: 'https://example.test',
    });
    expect(check.prepare('SELECT COUNT(*) AS n FROM service_links').get()).toEqual({ n: 0 });
    check.exec(
      "INSERT INTO link_types(id,name,color) VALUES(1,'LAN','green'); INSERT INTO service_links(id,service_id,type_id,url) VALUES(1,7,1,'http://192.168.1.5')",
    );
    expect(() => check.exec("INSERT INTO link_types(name,color) VALUES('lan','blue')")).toThrow();
    check.exec('DELETE FROM link_types WHERE id=1');
    expect(check.prepare('SELECT type_id,name,open_target FROM service_links').get()).toEqual({
      type_id: null,
      name: '',
      open_target: null,
    });
    check.exec('DELETE FROM services WHERE id=7');
    expect(check.prepare('SELECT COUNT(*) AS n FROM service_links').get()).toEqual({ n: 0 });
    check.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it('adds unique optional aliases without changing existing services', () => {
  const dir = mkdtempSync(join(tmpdir(), 'homora-alias-migration-'));
  const path = join(dir, 'data.sqlite');
  try {
    const old = new DatabaseSync(path);
    old.exec(
      'CREATE TABLE __drizzle_migrations (id INTEGER PRIMARY KEY, hash TEXT NOT NULL, created_at NUMERIC NOT NULL)',
    );
    for (const migration of MIGRATIONS.slice(0, -2)) {
      for (const statement of migration.sql) old.exec(statement);
      old
        .prepare('INSERT INTO __drizzle_migrations(hash,created_at) VALUES(?,?)')
        .run(migration.hash, migration.folderMillis);
    }
    old.exec(
      "INSERT INTO services(id,name,url,category,description) VALUES(1,'Existing','https://example.test','Home',''),(2,'Second','https://two.test','Home','')",
    );
    old.close();
    createDatabase(path).close();
    const check = new DatabaseSync(path);
    expect(check.prepare('SELECT name,url,alias FROM services ORDER BY id').all()).toEqual([
      { name: 'Existing', url: 'https://example.test', alias: null },
      { name: 'Second', url: 'https://two.test', alias: null },
    ]);
    check.exec("UPDATE services SET alias='example' WHERE id=1");
    expect(() => check.exec("UPDATE services SET alias='example' WHERE id=2")).toThrow();
    check.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it('adds favorites and acknowledgements without touching cards; deleting a card removes them', () => {
  const dir = mkdtempSync(join(tmpdir(), 'homora-attention-migration-'));
  const path = join(dir, 'data.sqlite');
  try {
    const old = new DatabaseSync(path);
    old.exec(
      'CREATE TABLE __drizzle_migrations (id INTEGER PRIMARY KEY, hash TEXT NOT NULL, created_at NUMERIC NOT NULL)',
    );
    // Database created by the previous version: every migration except the last one.
    for (const migration of MIGRATIONS.slice(0, -1)) {
      for (const statement of migration.sql) old.exec(statement);
      old
        .prepare('INSERT INTO __drizzle_migrations(hash,created_at) VALUES(?,?)')
        .run(migration.hash, migration.folderMillis);
    }
    old.exec(
      "INSERT INTO services(id,name,url,category,description) VALUES(7,'Existing','https://example.test','Home','')",
    );
    old.close();
    createDatabase(path).close();
    const check = new DatabaseSync(path);
    check.exec('PRAGMA foreign_keys = ON');
    expect(check.prepare('SELECT name,url FROM services WHERE id=7').get()).toEqual({
      name: 'Existing',
      url: 'https://example.test',
    });
    expect(check.prepare('SELECT COUNT(*) AS n FROM service_pins').get()).toEqual({ n: 0 });
    expect(check.prepare('SELECT COUNT(*) AS n FROM service_acknowledgements').get()).toEqual({
      n: 0,
    });
    check.exec(
      'INSERT INTO service_pins(service_id,pinned_at) VALUES(7,1); INSERT INTO service_acknowledgements(service_id,acknowledged_at) VALUES(7,1)',
    );
    expect(() =>
      check.exec('INSERT INTO service_pins(service_id,pinned_at) VALUES(7,2)'),
    ).toThrow();
    expect(() =>
      check.exec('INSERT INTO service_pins(service_id,pinned_at) VALUES(99,2)'),
    ).toThrow();
    check.exec('DELETE FROM services WHERE id=7');
    expect(check.prepare('SELECT COUNT(*) AS n FROM service_pins').get()).toEqual({ n: 0 });
    expect(check.prepare('SELECT COUNT(*) AS n FROM service_acknowledgements').get()).toEqual({
      n: 0,
    });
    check.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
