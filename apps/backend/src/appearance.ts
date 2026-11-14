import type { DatabaseSync } from 'node:sqlite';
import {
  APPEARANCE_KEY,
  DEFAULT_APPEARANCE,
  parseAppearance,
  type Appearance,
} from '@homora/shared';

/**
 * Instance-wide appearance, stored as one JSON value in `app_settings`. Whatever is stored is
 * validated again on read: a damaged or outdated value falls back to the default look instead
 * of breaking the page.
 */
export function createAppearance(sqlite: DatabaseSync) {
  return {
    get(): Appearance {
      const row = sqlite
        .prepare('SELECT value FROM app_settings WHERE key=?')
        .get(APPEARANCE_KEY) as { value: string } | undefined;
      if (!row) return DEFAULT_APPEARANCE;
      try {
        return parseAppearance(JSON.parse(row.value)) ?? DEFAULT_APPEARANCE;
      } catch {
        // Corrupt saved JSON falls back to the defaults; the next save rewrites it.
        return DEFAULT_APPEARANCE;
      }
    },
    set(appearance: Appearance) {
      sqlite
        .prepare(
          'INSERT INTO app_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
        )
        .run(APPEARANCE_KEY, JSON.stringify(appearance));
    },
    reset() {
      sqlite.prepare('DELETE FROM app_settings WHERE key=?').run(APPEARANCE_KEY);
    },
  };
}

export type AppearanceStore = ReturnType<typeof createAppearance>;
