import { describe, expect, it } from 'vitest';
import { createDatabase, getSqliteHandle } from '@homora/db';
import { normalizeIcon } from '@homora/shared';
import { seedDevelopmentDatabase } from './dev-seed.js';

describe('development data', () => {
  it('creates illustrative groups and services without authorizing private network', () => {
    const database = createDatabase(':memory:');
    try {
      const sqlite = getSqliteHandle(database.db);
      seedDevelopmentDatabase(sqlite);
      expect(sqlite.prepare('SELECT name FROM service_groups ORDER BY position').all()).toEqual([
        { name: 'Essentials' },
        { name: 'Entertainment' },
        { name: 'Infrastructure' },
      ]);
      const rows = sqlite.prepare('SELECT url, icon, allow_private FROM service_cards').all();
      expect(rows.every((row) => row.icon !== '' && normalizeIcon(row.icon) === row.icon)).toBe(
        true,
      );
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
