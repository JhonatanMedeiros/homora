import { DatabaseSync, backup } from 'node:sqlite';
import { constants } from 'node:fs';
import { access, chmod, mkdir, open, unlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const [sourceArg, targetArg] = process.argv.slice(2);
if (!sourceArg || !targetArg) {
  console.error('Usage: node scripts/backup.mjs <source-db> <target-file>');
  process.exitCode = 1;
} else {
  const source = resolve(sourceArg);
  const target = resolve(targetArg);
  let reserved = false;
  let db;
  try {
    if (source === target) throw new Error('Source and target must be different.');
    await access(source, constants.R_OK);
    await mkdir(dirname(target), { recursive: true });
    const file = await open(target, 'wx', 0o600);
    reserved = true;
    await file.close();
    db = new DatabaseSync(source, { readOnly: true });
    const result = db.prepare('PRAGMA integrity_check').get();
    if (result?.integrity_check !== 'ok') throw new Error('Database integrity check failed.');
    await backup(db, target);
    await chmod(target, 0o600);
    console.log(`Backup created: ${target}`);
  } catch (error) {
    if (reserved) await unlink(target).catch(() => {});
    console.error(error instanceof Error ? error.message : 'Could not create backup.');
    process.exitCode = 1;
  } finally {
    db?.close();
  }
}
