import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createDatabase, getSqliteHandle, monitors, services } from './index.js';
describe('SQLite with Drizzle', () => {
  it('creates, queries, updates and removes a service', async () => {
    const { db, close } = createDatabase(':memory:');
    try {
      const [monitor] = await db.insert(monitors).values({ name: 'Jellyfin' }).returning();
      await db.insert(services).values({
        id: monitor.id,
        url: 'http://localhost:8096/',
        category: 'Media',
        description: '',
      });
      expect(await db.select().from(services)).toHaveLength(1);
      await db
        .update(monitors)
        .set({ name: 'Jellyfin updated' })
        .where(eq(monitors.id, monitor.id));
      expect((await db.select().from(monitors))[0].name).toBe('Jellyfin updated');
      // A card goes with its monitor, but a monitor can exist without a card (a probe).
      await db
        .insert(monitors)
        .values({ name: 'WAN', checkType: 'ping', checkUrl: 'http://1.1.1.1' });
      await db.delete(monitors).where(eq(monitors.id, monitor.id));
      expect(await db.select().from(services)).toEqual([]);
      expect(await db.select().from(monitors)).toHaveLength(1);
      expect(
        getSqliteHandle(db)
          .prepare('SELECT link_url, check_url FROM monitor_targets WHERE name=?')
          .get('WAN'),
      ).toEqual({ link_url: null, check_url: 'http://1.1.1.1' });
    } finally {
      close();
    }
  });
});

it('upgrades the monitoring view without changing cards, probes or history', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const directory = mkdtempSync(join(tmpdir(), 'homora-target-migration-'));
  const path = join(directory, 'test.sqlite');
  try {
    const first = createDatabase(path);
    const sqlite = getSqliteHandle(first.db);
    sqlite.exec(`
      INSERT INTO monitors(id,name,check_url) VALUES (101,'card','http://192.168.1.10/health'),(102,'probe','http://192.168.1.11/');
      INSERT INTO services(id,url,category,description) VALUES (101,'https://example.test/','Media','');
      INSERT INTO service_observation_history(service_id,signature,observed_at,observation) VALUES(101,'old',1,'{"status":"available"}');
      DROP VIEW monitor_targets;
      CREATE VIEW monitor_targets AS SELECT m.id,m.name,COALESCE(s.url,m.check_url) AS url,m.allow_private,m.check_insecure,m.check_type,m.check_interval,m.expected_status,m.check_path,m.check_url,m.check_match,m.is_public FROM monitors m LEFT JOIN services s ON s.id=m.id;
      ALTER TABLE page_widgets DROP COLUMN size;
      ALTER TABLE services DROP COLUMN host_external;
      DROP TRIGGER service_identity_insert;
      DROP TABLE service_identities;
      DROP TABLE oidc_settings;
      DELETE FROM __drizzle_migrations WHERE created_at >= 1794900000000;
    `);
    first.close();
    const upgraded = createDatabase(path);
    try {
      const db = getSqliteHandle(upgraded.db);
      expect(
        db.prepare('SELECT id,link_url,check_url FROM monitor_targets ORDER BY id').all(),
      ).toEqual([
        { id: 101, link_url: 'https://example.test/', check_url: 'http://192.168.1.10/health' },
        { id: 102, link_url: null, check_url: 'http://192.168.1.11/' },
      ]);
      expect(
        db
          .prepare('PRAGMA table_info(monitor_targets)')
          .all()
          .map((row) => row.name),
      ).not.toContain('url');
      expect(
        db.prepare('SELECT signature FROM service_observation_history WHERE service_id=101').get(),
      ).toEqual({ signature: 'old' });
      expect(db.prepare('SELECT url FROM service_cards WHERE id=101').get()).toEqual({
        url: 'https://example.test/',
      });
      expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
      expect(
        db.prepare('SELECT identity FROM service_identities WHERE service_id=101').get(),
      ).toMatchObject({ identity: expect.stringMatching(/^[0-9a-f]{32}$/) });
    } finally {
      upgraded.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

it('adds the sign-in provider settings without touching the account or its links', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const directory = mkdtempSync(join(tmpdir(), 'homora-oidc-migration-'));
  const path = join(directory, 'test.sqlite');
  try {
    const first = createDatabase(path);
    const sqlite = getSqliteHandle(first.db);
    const latest = sqlite
      .prepare('SELECT MAX(created_at) AS at FROM __drizzle_migrations')
      .get() as { at: number };
    sqlite.exec(`
      INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES('u','Admin','admin@example.test',0,'2026-01-01','2026-01-01');
      INSERT INTO account(id,accountId,providerId,userId,createdAt,updatedAt) VALUES('a','subject','oidc-0123456789abcdef','u','2026-01-01','2026-01-01');
      DROP TABLE oidc_settings;
      DELETE FROM __drizzle_migrations WHERE created_at = ${latest.at};
    `);
    first.close();
    const upgraded = createDatabase(path);
    try {
      const db = getSqliteHandle(upgraded.db);
      expect(upgraded.migrations.appliedNow).toBe(1);
      expect(db.prepare('SELECT providerId, userId FROM account').get()).toEqual({
        providerId: 'oidc-0123456789abcdef',
        userId: 'u',
      });
      expect(db.prepare('SELECT COUNT(*) AS n FROM oidc_settings').get()).toEqual({ n: 0 });
      expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    } finally {
      upgraded.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

it('keeps service identities across renames and replaces them after deletion and recreation', () => {
  const database = createDatabase(':memory:');
  const sqlite = getSqliteHandle(database.db);
  try {
    sqlite.exec(
      "INSERT INTO monitors(id,name) VALUES(42,'First'); INSERT INTO services(id,url,category,description) VALUES(42,'https://example.test','Home','');",
    );
    const read = () =>
      (
        sqlite.prepare('SELECT identity FROM service_identities WHERE service_id=42').get() as {
          identity: string;
        }
      ).identity;
    const original = read();
    expect(original).toMatch(/^[0-9a-f]{32}$/);
    sqlite.exec("UPDATE monitors SET name='Renamed' WHERE id=42");
    expect(read()).toBe(original);
    sqlite.exec(
      "DELETE FROM monitors WHERE id=42; INSERT INTO monitors(id,name) VALUES(42,'First'); INSERT INTO services(id,url,category,description) VALUES(42,'https://example.test','Home','');",
    );
    expect(read()).not.toBe(original);
  } finally {
    sqlite.close();
  }
});

it('preserves a service identity and its widget selection in a SQLite backup', async () => {
  const { backup, DatabaseSync } = await import('node:sqlite');
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'homora-latency-backup-'));
  const source = createDatabase(':memory:');
  const db = getSqliteHandle(source.db);
  try {
    db.exec(
      "INSERT INTO monitors(id,name) VALUES(42,'Service'); INSERT INTO services(id,url,category,description) VALUES(42,'https://example.test','Home','');",
    );
    const { identity } = db
      .prepare('SELECT identity FROM service_identities WHERE service_id=42')
      .get() as { identity: string };
    const { id } = db.prepare('SELECT id FROM pages LIMIT 1').get() as { id: number };
    db.prepare(
      "INSERT INTO page_widgets(page_id,type,name,config,version,size,position) VALUES(?,'latency-history','',?,1,'wide',0)",
    ).run(id, JSON.stringify({ target: identity, range: '7d' }));
    const path = join(dir, 'backup.sqlite');
    await backup(db, path);
    const restored = new DatabaseSync(path);
    try {
      expect(
        restored.prepare('SELECT identity FROM service_identities WHERE service_id=42').get(),
      ).toEqual({ identity });
      expect(
        JSON.parse(
          (restored.prepare('SELECT config FROM page_widgets').get() as { config: string }).config,
        ),
      ).toEqual({ target: identity, range: '7d' });
    } finally {
      restored.close();
    }
  } finally {
    source.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
