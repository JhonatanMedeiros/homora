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
        getSqliteHandle(db).prepare('SELECT url FROM monitor_targets WHERE name=?').get('WAN'),
      ).toEqual({ url: 'http://1.1.1.1' });
    } finally {
      close();
    }
  });
});
