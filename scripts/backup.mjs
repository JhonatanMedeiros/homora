import { DatabaseSync, backup } from 'node:sqlite';
import { constants } from 'node:fs';
import { access, chmod, copyFile, mkdir, open, unlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const [sourceArg, targetArg] = process.argv.slice(2);
if (!sourceArg || !targetArg) {
  console.error('Usage: bun scripts/backup.mjs <source-db> <target-file>');
  process.exitCode = 1;
} else {
  const source = resolve(sourceArg);
  const target = resolve(targetArg);
  let reserved = false;
  let pictureTarget;
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
    // The background image lives in a file next to the database: take it along when it exists,
    // so a restored copy keeps its picture. Never overwrites an existing one.
    const picture = await access(`${source}.background`, constants.R_OK).then(
      () => true,
      () => false,
    );
    if (picture) {
      await copyFile(`${source}.background`, `${target}.background`, constants.COPYFILE_EXCL);
      // Only a file created here may be cleaned up on failure.
      pictureTarget = `${target}.background`;
      await chmod(pictureTarget, 0o600);
    }
    console.log(`Backup created: ${target}`);
  } catch (error) {
    if (reserved) await unlink(target).catch(() => {});
    if (pictureTarget) await unlink(pictureTarget).catch(() => {});
    console.error(error instanceof Error ? error.message : 'Could not create backup.');
    process.exitCode = 1;
  } finally {
    db?.close();
  }
}
