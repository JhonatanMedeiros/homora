import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createDatabase, services } from './index.js';
describe('SQLite com Drizzle', () => {
  it('cria, consulta, atualiza e remove um serviço', async () => {
    const { db, close } = createDatabase(':memory:');
    try {
      const [created] = await db
        .insert(services)
        .values({
          name: 'Jellyfin',
          url: 'http://localhost:8096/',
          category: 'Mídia',
          description: '',
        })
        .returning();
      expect(await db.select().from(services)).toHaveLength(1);
      await db
        .update(services)
        .set({ name: 'Jellyfin atualizado' })
        .where(eq(services.id, created.id));
      expect((await db.select().from(services))[0].name).toBe('Jellyfin atualizado');
      await db.delete(services).where(eq(services.id, created.id));
      expect(await db.select().from(services)).toEqual([]);
    } finally {
      close();
    }
  });
});
