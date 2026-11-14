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
      DELETE FROM __drizzle_migrations WHERE created_at = 1794900000000;
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
    } finally {
      upgraded.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
