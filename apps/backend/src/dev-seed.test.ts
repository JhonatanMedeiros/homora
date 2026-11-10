import { describe, expect, it } from 'vitest';
import { createDatabase, getSqliteHandle } from '@homora/db';
import { seedDevelopmentDatabase } from './dev-seed.js';

describe('dados de desenvolvimento', () => {
  it('cria grupos e serviços ilustrativos sem autorizar rede privada', () => {
    const database = createDatabase(':memory:');
    try {
      const sqlite = getSqliteHandle(database.db);
      seedDevelopmentDatabase(sqlite);
      expect(sqlite.prepare('SELECT name FROM service_groups ORDER BY position').all()).toEqual([
        { name: 'Essenciais' },
        { name: 'Entretenimento' },
        { name: 'Infraestrutura' },
      ]);
      const rows = sqlite.prepare('SELECT url, allow_private FROM services').all();
      expect(rows).toHaveLength(8);
      expect(
        rows.every(
          (row) => String(row.url).startsWith('http://127.0.0.1:') && row.allow_private === 0,
        ),
      ).toBe(true);
    } finally {
      database.close();
    }
  });
});
