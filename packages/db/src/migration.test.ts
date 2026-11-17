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
  serviceGroups,
  integrationInstances,
  integrationWidgets,
} from './index.js';

/** The cards of a migrated database, in the shape the `services` table had before cards and monitors split. */
const cardsOf = (database: ReturnType<typeof createDatabase>) =>
  (
    getSqliteHandle(database.db)
      .prepare(
        'SELECT id,name,alias,check_url AS checkUrl,position,allow_private AS allowPrivate,open_target AS openTarget FROM service_cards ORDER BY id',
      )
      .all() as {
      id: number;
      name: string;
      alias: string | null;
      checkUrl: string | null;
      position: number;
      allowPrivate: number;
      openTarget: string;
    }[]
  ).map((row) => ({ ...row, allowPrivate: Boolean(row.allowPrivate) }));

const MIGRATIONS = readMigrationFiles({
  migrationsFolder: fileURLToPath(new URL('../migrations', import.meta.url)),
});
it('defaults insecure monitoring to off when upgrading existing services', () => {
  const dir = mkdtempSync(join(tmpdir(), 'homora-insecure-migration-'));
  const path = join(dir, 'data.sqlite');
  try {
    const old = new DatabaseSync(path);
    old.exec(
      'CREATE TABLE __drizzle_migrations (id INTEGER PRIMARY KEY, hash TEXT NOT NULL, created_at NUMERIC NOT NULL)',
    );
    for (const migration of MIGRATIONS.slice(0, 41)) {
      for (const statement of migration.sql) old.exec(statement);
      old
        .prepare('INSERT INTO __drizzle_migrations(hash,created_at) VALUES(?,?)')
        .run(migration.hash, migration.folderMillis);
    }
    old.exec(
      "INSERT INTO monitors(id,name,allow_private,check_url) VALUES(5,'Existing',1,NULL),(6,'Probe',1,'https://probe.test'); INSERT INTO services(id,url,category,description) VALUES(5,'https://example.test','Home','')",
    );
    old.close();
    const database = createDatabase(path);
    const row = getSqliteHandle(database.db)
      .prepare('SELECT name,allow_private,check_insecure FROM service_cards WHERE id=5')
      .get();
    expect(row).toMatchObject({ name: 'Existing', allow_private: 1, check_insecure: 0 });
    expect(
      getSqliteHandle(database.db)
        .prepare('SELECT name,check_insecure FROM monitor_targets WHERE id=6')
        .get(),
    ).toEqual({ name: 'Probe', check_insecure: 0 });
    database.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
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
    expect(cardsOf(database)[0].name).toBe('Jellyfin');
    expect(cardsOf(database)[0].alias).toBeNull();
    expect(cardsOf(database)[0].checkUrl).toBeNull();
    expect((await database.db.select().from(serviceGroups)).map(({ name }) => name)).toEqual([
      'Media',
    ]);
    expect(cardsOf(database)[0].position).toBe(0);
    expect(cardsOf(database)[0].allowPrivate).toBe(false);
    expect(cardsOf(database)[0].openTarget).toBe('new-tab');
    database.close();
    database = createDatabase(path);
    expect(cardsOf(database)).toHaveLength(1);
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
    expect(cardsOf(database)[0].name).toBe('App');
    expect(cardsOf(database)[0].allowPrivate).toBe(false);
    await expect(database.db.delete(integrationInstances)).rejects.toThrow();
    database.close();
    database = createDatabase(path);
    expect(await database.db.select().from(integrationInstances)).toHaveLength(1);
    expect((await database.db.select().from(integrationWidgets))[0].integrationId).toBe(
      instance.id,
    );
    expect(cardsOf(database)).toHaveLength(1);
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
    expect(cardsOf(db)[0].name).toBe('Existing');
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
      check.prepare('SELECT name, expected_status, check_path FROM service_cards WHERE id=5').get(),
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
      "INSERT INTO monitors(id,name) VALUES(1,'S'); INSERT INTO services(id,url,category,description) VALUES(1,'http://x/','C','');",
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
        .prepare('SELECT name,is_public,expected_status,check_path FROM service_cards WHERE id=5')
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
    expect(db.prepare('SELECT name FROM service_cards WHERE id=1').get()).toEqual({
      name: 'Existing',
    });
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
          'SELECT name,host_connection_id,host_node,host_vmid,host_type FROM service_cards WHERE id=7',
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
      check.prepare('SELECT host_connection_id,host_node FROM service_cards WHERE id=7').get(),
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
    expect(check.prepare('SELECT name,host_node FROM service_cards WHERE id=7').get()).toEqual({
      name: 'Existing',
      host_node: 'pve1',
    });
    check.exec(
      "INSERT INTO integration_instances(id,type,name) VALUES(3,'proxmox','PVE'); INSERT INTO host_suggestion_dismissals VALUES(7,3,'pve1',101,'lxc',1)",
    );
    expect(() =>
      check.exec("INSERT INTO host_suggestion_dismissals VALUES(7,3,'pve1',101,'lxc',2)"),
    ).toThrow();
    check.exec('DELETE FROM monitors WHERE id=7');
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
    expect(check.prepare('SELECT name FROM service_cards ORDER BY id').all()).toEqual([
      { name: 'A' },
      { name: 'B' },
    ]);
    check.exec('INSERT INTO service_dependencies VALUES(1,2,1)');
    expect(() => check.exec('INSERT INTO service_dependencies VALUES(1,2,2)')).toThrow();
    expect(() => check.exec('INSERT INTO service_dependencies VALUES(1,1,2)')).toThrow();
    check.exec('DELETE FROM monitors WHERE id=2');
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
    expect(check.prepare('SELECT name,category FROM service_cards').all()).toEqual([
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
    expect(check.prepare('SELECT name FROM service_cards ORDER BY id').all()).toEqual([
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
    check.exec('DELETE FROM monitors WHERE id=1');
    expect(check.prepare('SELECT service_id FROM integration_resource_links').all()).toEqual([
      { service_id: 2 },
    ]);
    check.exec('DELETE FROM integration_instances WHERE id=2');
    expect(check.prepare('SELECT COUNT(*) AS n FROM integration_resource_links').get()).toEqual({
      n: 0,
    });
    expect(check.prepare('SELECT COUNT(*) AS n FROM service_cards').get()).toEqual({ n: 1 });
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
    for (const migration of MIGRATIONS.slice(0, 36)) {
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
    expect(check.prepare('SELECT name,url FROM service_cards WHERE id=7').get()).toEqual({
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
    check.exec('DELETE FROM monitors WHERE id=7');
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
    for (const migration of MIGRATIONS.slice(0, 37)) {
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
    expect(check.prepare('SELECT name,url,alias FROM service_cards ORDER BY id').all()).toEqual([
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
    // Start immediately before the attention migration (0038).
    for (const migration of MIGRATIONS.slice(0, 38)) {
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
    expect(check.prepare('SELECT name,url FROM service_cards WHERE id=7').get()).toEqual({
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
    check.exec('DELETE FROM monitors WHERE id=7');
    expect(check.prepare('SELECT COUNT(*) AS n FROM service_pins').get()).toEqual({ n: 0 });
    expect(check.prepare('SELECT COUNT(*) AS n FROM service_acknowledgements').get()).toEqual({
      n: 0,
    });
    check.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it('splits cards from monitors keeping every row, id and relation, and lets a probe exist without a card', () => {
  const dir = mkdtempSync(join(tmpdir(), 'homora-monitors-migration-'));
  const path = join(dir, 'data.sqlite');
  try {
    const old = new DatabaseSync(path);
    old.exec(
      'CREATE TABLE __drizzle_migrations (id INTEGER PRIMARY KEY, hash TEXT NOT NULL, created_at NUMERIC NOT NULL)',
    );
    // Start immediately before the monitors and probes migration (0040).
    for (const migration of MIGRATIONS.slice(0, 40)) {
      for (const statement of migration.sql) old.exec(statement);
      old
        .prepare('INSERT INTO __drizzle_migrations(hash,created_at) VALUES(?,?)')
        .run(migration.hash, migration.folderMillis);
    }
    old.exec(`
      INSERT INTO integration_instances(id,type,name) VALUES(3,'proxmox','PVE');
      INSERT INTO services(id,name,url,category,description,icon,position,allow_private,check_type,
        check_interval,expected_status,check_path,check_url,check_match,open_target,alias,is_public,
        host_connection_id,host_node,host_vmid,host_type)
        VALUES(7,'Nextcloud','https://cloud.test/','Home','Files','cloud',2,1,'keyword',45,'2xx','/status',
        'https://probe.test/up','ok','same-tab','cloud',1,3,'pve1',100,'lxc'),
        (9,'Jellyfin','http://jf.test/','Media','','',0,0,'http',NULL,NULL,NULL,NULL,NULL,'new-tab',NULL,0,NULL,NULL,NULL,NULL);
      INSERT INTO service_observations(service_id,signature,observation) VALUES(7,'s','{}');
      INSERT INTO service_observation_history(service_id,signature,observed_at,observation)
        VALUES(7,'s',1,'{"status":"available","latencyMs":3}'),(9,'s',2,'{"status":"unavailable"}');
      INSERT INTO notification_states(service_id,state) VALUES(7,'{}');
      INSERT INTO service_monitor_settings(service_id,failure_threshold,recovery_threshold) VALUES(7,3,2);
      INSERT INTO service_incidents(service_id,started_at,reason) VALUES(9,5,'no-response');
      INSERT INTO service_maintenance(service_id,starts_at,ends_at,note) VALUES(7,1,2,'n');
      INSERT INTO service_uptime_rollup(service_id,hour,up) VALUES(7,10,1);
      INSERT INTO service_acknowledgements(service_id,acknowledged_at) VALUES(9,1);
      INSERT INTO service_dependencies(service_id,depends_on_id,created_at) VALUES(7,9,1);
      INSERT INTO service_tags(service_id,tag) VALUES(7,'prod');
      INSERT INTO link_types(id,name,color) VALUES(1,'LAN','blue');
      INSERT INTO service_links(service_id,type_id,name,url,position) VALUES(7,1,'Admin','http://a.test/',0);
      INSERT INTO service_pins(service_id,pinned_at) VALUES(7,1);
      INSERT INTO integration_resource_links(service_id,integration_id,resource_uuid,resource_type,seen_name,created_at)
        VALUES(7,3,'u','app','Nextcloud',1);
      INSERT INTO integration_widgets(id,integration_id,type,name,service_id) VALUES(1,3,'t','W',7);
      INSERT INTO host_suggestion_dismissals(service_id,connection_id,node,vmid,type,created_at)
        VALUES(7,3,'pve1',101,'lxc',1);
    `);
    old.close();

    createDatabase(path).close();

    const check = new DatabaseSync(path);
    check.exec('PRAGMA foreign_keys = ON');
    const rows = (sql: string) => check.prepare(sql).all();
    const count = (table: string) =>
      (check.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;

    // Same ids and values, split by what each table is for.
    expect(rows('SELECT * FROM monitors ORDER BY id')).toEqual([
      {
        id: 7,
        name: 'Nextcloud',
        check_type: 'keyword',
        check_interval: 45,
        expected_status: '2xx',
        check_path: '/status',
        check_url: 'https://probe.test/up',
        check_match: 'ok',
        allow_private: 1,
        check_insecure: 0,
        is_public: 1,
      },
      {
        id: 9,
        name: 'Jellyfin',
        check_type: 'http',
        check_interval: null,
        expected_status: null,
        check_path: null,
        check_url: null,
        check_match: null,
        allow_private: 0,
        check_insecure: 0,
        is_public: 0,
      },
    ]);
    expect(rows('SELECT * FROM services ORDER BY id')).toEqual([
      {
        id: 7,
        url: 'https://cloud.test/',
        alias: 'cloud',
        category: 'Home',
        description: 'Files',
        icon: 'cloud',
        position: 2,
        open_target: 'same-tab',
        host_connection_id: 3,
        host_node: 'pve1',
        host_vmid: 100,
        host_type: 'lxc',
      },
      {
        id: 9,
        url: 'http://jf.test/',
        alias: null,
        category: 'Media',
        description: '',
        icon: '',
        position: 0,
        open_target: 'new-tab',
        host_connection_id: null,
        host_node: null,
        host_vmid: null,
        host_type: null,
      },
    ]);
    // The views rebuild the shape the application reads.
    expect(
      rows('SELECT id,name,url,check_url,alias,is_public FROM service_cards ORDER BY id'),
    ).toEqual([
      {
        id: 7,
        name: 'Nextcloud',
        url: 'https://cloud.test/',
        check_url: 'https://probe.test/up',
        alias: 'cloud',
        is_public: 1,
      },
      {
        id: 9,
        name: 'Jellyfin',
        url: 'http://jf.test/',
        check_url: null,
        alias: null,
        is_public: 0,
      },
    ]);
    expect(rows('SELECT id,link_url,check_url FROM monitor_targets ORDER BY id')).toEqual([
      { id: 7, link_url: 'https://cloud.test/', check_url: 'https://probe.test/up' },
      { id: 9, link_url: 'http://jf.test/', check_url: null },
    ]);

    // Nothing lost in any table that pointed at a service.
    expect(count('service_observations')).toBe(1);
    expect(count('service_observation_history')).toBe(2);
    expect(
      rows('SELECT status,latency_ms AS latency FROM service_observation_history ORDER BY id'),
    ).toEqual([
      { status: 'available', latency: 3 },
      { status: 'unavailable', latency: null },
    ]);
    for (const table of [
      'notification_states',
      'service_monitor_settings',
      'service_incidents',
      'service_maintenance',
      'service_uptime_rollup',
      'service_acknowledgements',
      'service_dependencies',
      'service_tags',
      'service_links',
      'service_pins',
      'integration_resource_links',
      'integration_widgets',
      'host_suggestion_dismissals',
    ])
      expect(count(table), table).toBe(1);
    expect(
      rows('SELECT failure_threshold,recovery_threshold FROM service_monitor_settings'),
    ).toEqual([{ failure_threshold: 3, recovery_threshold: 2 }]);

    // Monitoring state follows the monitor; card data follows the card.
    const parent = (table: string) =>
      (rows(`PRAGMA foreign_key_list(${table})`) as { table: string; from: string }[])
        .filter(({ from }) => from === 'service_id' || from === 'depends_on_id')
        .map(({ table: to }) => to);
    for (const table of [
      'service_observations',
      'service_observation_history',
      'notification_states',
      'service_monitor_settings',
      'service_incidents',
      'service_maintenance',
      'service_uptime_rollup',
      'service_acknowledgements',
    ])
      expect(parent(table), table).toEqual(['monitors']);
    expect(parent('service_dependencies')).toEqual(['monitors', 'monitors']);
    for (const table of [
      'service_tags',
      'service_links',
      'service_pins',
      'integration_resource_links',
      'integration_widgets',
      'host_suggestion_dismissals',
    ])
      expect(parent(table), table).toEqual(['services']);
    expect(rows('PRAGMA foreign_key_check')).toEqual([]);

    // A probe is a monitor without a card and keeps incidents, rollup and maintenance.
    check.exec(`
      INSERT INTO monitors(id,name,check_type,check_url) VALUES(20,'WAN','ping','http://1.1.1.1');
      INSERT INTO service_incidents(service_id,started_at,reason) VALUES(20,1,'no-response');
      INSERT INTO service_uptime_rollup(service_id,hour,up) VALUES(20,1,1);
      INSERT INTO service_maintenance(service_id,starts_at,ends_at) VALUES(20,1,2);
    `);
    expect(rows('SELECT id,link_url,check_url FROM monitor_targets WHERE id=20')).toEqual([
      { id: 20, link_url: null, check_url: 'http://1.1.1.1' },
    ]);
    expect(rows('SELECT id FROM service_cards WHERE id=20')).toEqual([]);
    // A card cannot be pinned, tagged or linked to a probe, and cannot exist without a monitor.
    expect(() =>
      check.exec('INSERT INTO service_pins(service_id,pinned_at) VALUES(20,1)'),
    ).toThrow();
    expect(() => check.exec("INSERT INTO service_tags(service_id,tag) VALUES(20,'x')")).toThrow();
    expect(() =>
      check.exec("INSERT INTO services(id,url,category,description) VALUES(99,'http://x/','C','')"),
    ).toThrow();
    // Aliases stay unique across cards.
    expect(() => check.exec("UPDATE services SET alias='cloud' WHERE id=9")).toThrow();

    // Deleting a card alone drops its own data but keeps what was monitored and recorded.
    check.exec('DELETE FROM services WHERE id=7');
    expect(count('service_pins')).toBe(0);
    expect(count('service_links')).toBe(0);
    expect(count('service_tags')).toBe(0);
    expect(count('integration_resource_links')).toBe(0);
    expect(rows('SELECT service_id FROM integration_widgets')).toEqual([{ service_id: null }]);
    expect(count('service_observation_history')).toBe(2);
    // Deleting the monitor takes the card and all its monitoring history with it.
    check.exec('DELETE FROM monitors WHERE id=9');
    expect(count('services')).toBe(0);
    expect(count('service_incidents')).toBe(1);
    expect(count('service_acknowledgements')).toBe(0);
    expect(count('service_dependencies')).toBe(0);
    check.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it('adds an empty inbox without changing existing cards and incidents', () => {
  const dir = mkdtempSync(join(tmpdir(), 'homora-inbox-migration-'));
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
      "INSERT INTO monitors(id,name) VALUES(5,'Existing'); INSERT INTO services(id,url,category,description) VALUES(5,'https://example.test','Home',''); INSERT INTO service_incidents(service_id,started_at,reason) VALUES(5,1,'no-response')",
    );
    old.close();
    const database = createDatabase(path);
    const db = getSqliteHandle(database.db);
    expect(db.prepare('SELECT name FROM service_cards WHERE id=5').get()).toEqual({
      name: 'Existing',
    });
    expect(db.prepare('SELECT count(*) AS n FROM service_incidents').get()).toEqual({ n: 1 });
    expect(db.prepare('SELECT count(*) AS n FROM inbox_notifications').get()).toEqual({ n: 0 });
    database.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it('lets inbox notifications point at probes and keeps the ones already stored', () => {
  const dir = mkdtempSync(join(tmpdir(), 'homora-inbox-probes-migration-'));
  const path = join(dir, 'data.sqlite');
  try {
    const old = new DatabaseSync(path);
    old.exec(
      'CREATE TABLE __drizzle_migrations (id INTEGER PRIMARY KEY, hash TEXT NOT NULL, created_at NUMERIC NOT NULL)',
    );
    for (const migration of MIGRATIONS.slice(0, -1)) {
      for (const statement of migration.sql) old.exec(statement);
      old
        .prepare('INSERT INTO __drizzle_migrations(hash,created_at) VALUES(?,?)')
        .run(migration.hash, migration.folderMillis);
    }
    old.exec(
      "INSERT INTO monitors(id,name) VALUES(5,'Card'); INSERT INTO services(id,url,category,description) VALUES(5,'https://example.test','Home',''); INSERT INTO inbox_notifications(service_id,kind,service_name,confirmed_at,started_at) VALUES(5,'down','Card',10,9)",
    );
    old.close();
    const database = createDatabase(path);
    const db = getSqliteHandle(database.db);
    db.exec('PRAGMA foreign_keys=ON');
    db.exec("INSERT INTO monitors(id,name) VALUES(6,'Probe')");
    db.exec(
      "INSERT INTO inbox_notifications(service_id,kind,service_name,confirmed_at,started_at) VALUES(6,'down','Probe',11,10)",
    );
    expect(
      db
        .prepare(
          'SELECT service_id AS id, service_name AS name FROM inbox_notifications ORDER BY id',
        )
        .all(),
    ).toEqual([
      { id: 5, name: 'Card' },
      { id: 6, name: 'Probe' },
    ]);
    db.exec('DELETE FROM monitors WHERE id=6');
    expect(
      db
        .prepare("SELECT service_id AS id FROM inbox_notifications WHERE service_name='Probe'")
        .get(),
    ).toEqual({ id: null });
    database.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it('adds the page widget size without changing existing rows', () => {
  const dir = mkdtempSync(join(tmpdir(), 'homora-widget-size-'));
  const path = join(dir, 'data.sqlite');
  try {
    const old = new DatabaseSync(path);
    old.exec(
      'CREATE TABLE __drizzle_migrations (id INTEGER PRIMARY KEY, hash TEXT NOT NULL, created_at NUMERIC NOT NULL)',
    );
    for (const migration of MIGRATIONS.slice(0, -1)) {
      for (const statement of migration.sql) old.exec(statement);
      old
        .prepare('INSERT INTO __drizzle_migrations(hash,created_at) VALUES(?,?)')
        .run(migration.hash, migration.folderMillis);
    }
    old.exec(
      "INSERT INTO page_widgets(id,page_id,type,name,config,version,position) VALUES(7,1,'clock','Existing','{}',1,3)",
    );
    old.close();
    createDatabase(path).close();
    const check = new DatabaseSync(path);
    expect(
      check
        .prepare('SELECT id,page_id,type,name,config,version,position,size FROM page_widgets')
        .get(),
    ).toEqual({
      id: 7,
      page_id: 1,
      type: 'clock',
      name: 'Existing',
      config: '{}',
      version: 1,
      position: 3,
      size: 'normal',
    });
    check.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
