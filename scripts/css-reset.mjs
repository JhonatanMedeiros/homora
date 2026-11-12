import { DatabaseSync } from 'node:sqlite';
import { constants } from 'node:fs';
import { access } from 'node:fs/promises';
import { resolve } from 'node:path';

// Turns the custom CSS off and keeps its text, so a stylesheet that hides critical buttons can
// always be recovered without editing the database by hand. Stop Homora first is not required.
const target = resolve(
  process.argv.slice(2).find((arg) => !arg.startsWith('--')) ??
    process.env.HOMORA_DATABASE_PATH ??
    'data/homora.sqlite',
);
let db;
try {
  await access(target, constants.R_OK | constants.W_OK);
  db = new DatabaseSync(target);
  const tables = new Set(
    db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((row) => row.name),
  );
  if (!tables.has('app_settings'))
    throw new Error('This database has no settings table. Start Homora once to migrate it.');
  const current = db
    .prepare("SELECT value FROM app_settings WHERE key = 'custom_css_enabled'")
    .get();
  const wasOn = current?.value === 'true';
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(
      "INSERT INTO app_settings(key,value) VALUES('custom_css_enabled','false') ON CONFLICT(key) DO UPDATE SET value='false'",
    ).run();
    if (tables.has('audit_events'))
      db.prepare(
        'INSERT INTO audit_events(actor,action,proposal_id,result,created_at,detail,ip_address) VALUES(?,?,?,?,?,?,?)',
      ).run(
        'anonymous',
        'custom-css-reset',
        null,
        'ok',
        Date.now(),
        wasOn ? 'cli: disabled' : 'cli: already off',
        null,
      );
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  console.log(
    wasOn
      ? `Custom CSS turned off in ${target}. Its text was kept.`
      : `Custom CSS was already off in ${target}. Nothing else changed.`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Could not turn off the custom CSS.');
  process.exitCode = 1;
} finally {
  db?.close();
}
