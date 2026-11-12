import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { CUSTOM_CSS_ENABLED_KEY, CUSTOM_CSS_KEY } from '@homora/shared';

/**
 * The custom stylesheet: text and an on/off flag in `app_settings`. Turning it off keeps the
 * text, so a stylesheet that breaks the page can be switched off and fixed later.
 */
export function createCustomCss(sqlite: DatabaseSync) {
  const read = (key: string) =>
    (
      sqlite.prepare('SELECT value FROM app_settings WHERE key=?').get(key) as
        { value: string } | undefined
    )?.value;
  const write = (key: string, value: string) =>
    sqlite
      .prepare(
        'INSERT INTO app_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
      )
      .run(key, value);
  return {
    get() {
      const css = read(CUSTOM_CSS_KEY) ?? '';
      return {
        css,
        enabled: read(CUSTOM_CSS_ENABLED_KEY) === 'true' && css.trim() !== '',
        bytes: Buffer.byteLength(css),
        // Changes whenever the text does, so the browser fetches the new file.
        version: createHash('sha256').update(css).digest('hex').slice(0, 12),
      };
    },
    setCss(css: string) {
      write(CUSTOM_CSS_KEY, css);
    },
    setEnabled(enabled: boolean) {
      write(CUSTOM_CSS_ENABLED_KEY, enabled ? 'true' : 'false');
    },
  };
}

export type CustomCssStore = ReturnType<typeof createCustomCss>;
