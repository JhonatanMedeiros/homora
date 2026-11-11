import { DatabaseSync } from 'node:sqlite';
import { constants } from 'node:fs';
import { access } from 'node:fs/promises';
import { resolve } from 'node:path';

// Removes the administrator account and every session so the next visit shows the first-run
// account creation again. Cards, groups and encrypted connections are kept.
const args = process.argv.slice(2);
const confirmed = args.includes('--yes');
const target = resolve(
  args.find((arg) => !arg.startsWith('--')) ??
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
  for (const table of ['user', 'account', 'session', 'verification'])
    if (!tables.has(table))
      throw new Error('This database has no account tables. Start Homora once to migrate it.');
  const accounts = db.prepare('SELECT COUNT(*) AS n FROM "user"').get().n;
  if (!confirmed) {
    console.log(`${target} has ${accounts} account(s). Nothing was changed.`);
    console.log('Run again with --yes to remove the account and all sessions.');
  } else {
    db.exec('BEGIN IMMEDIATE');
    try {
      for (const table of ['session', 'account', 'verification', '"user"'])
        db.exec(`DELETE FROM ${table}`);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    console.log(`Removed ${accounts} account(s) and every session from ${target}.`);
    console.log('Open Homora to create a new administrator account.');
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Could not reset the account.');
  process.exitCode = 1;
} finally {
  db?.close();
}
